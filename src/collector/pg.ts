/**
 * Collector-side PostgreSQL operations. Handles the write path:
 * URL intake, batch checkout with fair scheduling, page updates, chunk writes,
 * and hard-deletion of permanently-failed URLs.
 *
 * The core scheduling invariant — match upstream — is a round-robin over
 * collect_count. New URLs enter at the current minimum (excluding zero) so a
 * flood of newly-discovered URLs does not starve existing work. Batch checkout
 * uses SELECT ... FOR UPDATE SKIP LOCKED so parallel collector processes do
 * not step on each other.
 */

import type { Sql } from "postgres";
import { logger } from "../logger.ts";

export interface PageRecord {
	readonly id: string;
	readonly url: string;
	readonly title: string | null;
	readonly content: string | null;
	readonly raw_json: unknown;
	readonly collect_count: number;
}

export interface ChunkRow {
	readonly url: string;
	readonly title: string | null;
	readonly content: string;
	readonly embedding: readonly number[];
	readonly chunk_index: number;
	readonly total_chunks: number;
}

const APPLE_URL_PATTERN = "https://developer.apple.com/%";

export async function batchInsertUrls(sql: Sql, urls: readonly string[]): Promise<number> {
	if (urls.length === 0) return 0;

	const minRow = await sql<{ min: string | number | null }[]>`
    SELECT COALESCE(
      (SELECT MIN(collect_count)
       FROM pages
       WHERE url LIKE ${APPLE_URL_PATTERN}
       AND collect_count > 0),
      0
    ) AS min
  `;
	const minCollectCount = Number(minRow[0]?.min ?? 0);

	const rows = urls.map((url) => ({ url, collect_count: minCollectCount }));
	const result = await sql`
    INSERT INTO pages ${sql(rows, "url", "collect_count")}
    ON CONFLICT (url) DO NOTHING
  `;

	return result.count ?? 0;
}

export async function getBatchRecords(sql: Sql, batchSize: number): Promise<PageRecord[]> {
	const rows = await sql<PageRecord[]>`
    WITH min_count_records AS (
      SELECT id FROM pages
      WHERE url LIKE ${APPLE_URL_PATTERN}
        AND collect_count = (
          SELECT MIN(collect_count)
          FROM pages
          WHERE url LIKE ${APPLE_URL_PATTERN}
        )
      ORDER BY
        CASE WHEN content IS NULL OR content = '' THEN 0 ELSE 1 END ASC,
        CASE WHEN title IS NULL OR title = '' THEN 0 ELSE 1 END ASC,
        url ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE pages
    SET collect_count = collect_count + 1
    WHERE id IN (SELECT id FROM min_count_records)
    RETURNING id, url, title, content, raw_json, collect_count
  `;

	return rows.map((r) => ({
		...r,
		collect_count: Number(r.collect_count),
	}));
}

export interface PageUpdate {
	readonly id: string;
	readonly title: string | null;
	readonly content: string;
	readonly raw_json: string | null;
}

export async function batchUpdatePages(sql: Sql, updates: readonly PageUpdate[]): Promise<void> {
	if (updates.length === 0) return;

	await sql.begin(async (tx) => {
		for (const u of updates) {
			await tx`
        UPDATE pages
        SET title = ${u.title},
            content = ${u.content},
            raw_json = ${u.raw_json},
            updated_at = NOW()
        WHERE id = ${u.id}
      `;
		}
	});
	logger.info(`[pg] updated ${updates.length} page(s)`);
}

export async function insertChunks(sql: Sql, chunks: readonly ChunkRow[]): Promise<void> {
	if (chunks.length === 0) return;

	await sql.begin(async (tx) => {
		const urls = [...new Set(chunks.map((c) => c.url))];
		const del = await tx`DELETE FROM chunks WHERE url = ANY(${urls})`;
		logger.debug(`[pg] removed ${del.count ?? 0} prior chunk(s) across ${urls.length} URL(s)`);

		for (const c of chunks) {
			const embeddingLiteral = `[${c.embedding.join(",")}]`;
			await tx`
        INSERT INTO chunks (url, title, content, embedding, chunk_index, total_chunks)
        VALUES (${c.url}, ${c.title}, ${c.content}, ${embeddingLiteral}::halfvec, ${c.chunk_index}, ${c.total_chunks})
      `;
		}
	});
	logger.info(`[pg] inserted ${chunks.length} chunk(s)`);
}

export async function deleteRecords(sql: Sql, ids: readonly string[]): Promise<void> {
	if (ids.length === 0) return;

	await sql.begin(async (tx) => {
		const chunkDel = await tx`
      DELETE FROM chunks
      WHERE url IN (SELECT url FROM pages WHERE id = ANY(${ids}))
    `;
		const pageDel = await tx`DELETE FROM pages WHERE id = ANY(${ids})`;
		logger.info(
			`[pg] pruned ${pageDel.count ?? 0} page(s) and ${chunkDel.count ?? 0} chunk(s) for permanent errors`,
		);
	});
}
