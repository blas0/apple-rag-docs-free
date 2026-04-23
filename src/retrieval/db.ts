/**
 * Read-path database queries. Isolated from the collector's write-path.
 */

import type { Sql } from "../db/client.ts";
import { logger } from "../logger.ts";

export interface SearchHit {
	readonly id: string;
	readonly url: string;
	readonly title: string | null;
	readonly content: string;
	readonly chunk_index: number;
	readonly total_chunks: number;
}

export interface PageRow {
	readonly id: string;
	readonly url: string;
	readonly title: string | null;
	readonly content: string;
}

function mapHit(row: Record<string, unknown>): SearchHit {
	return {
		id: row.id as string,
		url: row.url as string,
		title: (row.title as string | null) ?? null,
		content: row.content as string,
		chunk_index: Number(row.chunk_index),
		total_chunks: Number(row.total_chunks),
	};
}

export async function semanticSearch(
	sql: Sql,
	queryEmbedding: readonly number[],
	resultCount: number,
): Promise<SearchHit[]> {
	try {
		const rows = await sql<Record<string, unknown>[]>`
			SELECT id, url, title, content, chunk_index, total_chunks
			FROM chunks
			WHERE embedding IS NOT NULL
			ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::halfvec
			LIMIT ${resultCount}
		`;
		return rows.map(mapHit);
	} catch (err) {
		logger.error(`semanticSearch failed (dim=${queryEmbedding.length}, k=${resultCount}): ${err}`);
		throw new Error("vector search failed");
	}
}

export async function keywordSearch(
	sql: Sql,
	query: string,
	resultCount: number,
): Promise<SearchHit[]> {
	try {
		const rows = await sql<Record<string, unknown>[]>`
			SELECT id, url, title, content, chunk_index, total_chunks
			FROM chunks
			WHERE to_tsvector('simple', coalesce(title, '') || ' ' || content)
			      @@ plainto_tsquery('simple', ${query})
			LIMIT ${resultCount}
		`;
		return rows.map(mapHit);
	} catch (err) {
		logger.error(`keywordSearch failed (q="${query.slice(0, 50)}", k=${resultCount}): ${err}`);
		throw new Error("keyword search failed");
	}
}

function normalizeUrl(url: string): string {
	let u = url.replace(/\/$/, "");
	if (!u.startsWith("http://") && !u.startsWith("https://")) u = `https://${u}`;
	if (u.startsWith("http://")) u = u.replace("http://", "https://");
	return u;
}

export async function getPageByUrl(sql: Sql, url: string): Promise<PageRow | null> {
	const primary = normalizeUrl(url);
	try {
		let rows = await sql<Record<string, unknown>[]>`
			SELECT id, url, title, content FROM pages WHERE url = ${primary} LIMIT 1
		`;

		if (rows.length === 0) {
			const alt = primary.endsWith("/") ? primary.slice(0, -1) : `${primary}/`;
			rows = await sql<Record<string, unknown>[]>`
				SELECT id, url, title, content FROM pages WHERE url = ${alt} LIMIT 1
			`;
		}

		const row = rows[0];
		if (!row) return null;

		return {
			id: row.id as string,
			url: row.url as string,
			title: (row.title as string | null) ?? null,
			content: (row.content as string) ?? "",
		};
	} catch (err) {
		logger.error(`getPageByUrl failed for ${url.slice(0, 100)}: ${err}`);
		throw new Error("page lookup failed");
	}
}
