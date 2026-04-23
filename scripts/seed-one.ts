/**
 * Ingest a single Apple Developer URL end-to-end. Useful for smoke tests and
 * for populating the database with known-good records before running the full
 * collector.
 *
 * Usage:
 *   bun run scripts/seed-one.ts https://developer.apple.com/documentation/swiftui/view
 */

import { fetchDocumentJson, fetchVideo, isVideoUrl } from "../src/collector/appleClient.ts";
import { chunkText } from "../src/collector/chunker.ts";
import { processDocument } from "../src/collector/contentProcessor.ts";
import {
	batchInsertUrls,
	batchUpdatePages,
	type ChunkRow,
	insertChunks,
} from "../src/collector/pg.ts";
import { loadConfig } from "../src/config.ts";
import { closeSql, getSql } from "../src/db/client.ts";
import { logger, setLogLevel } from "../src/logger.ts";
import { EmbeddingService } from "../src/retrieval/embedding.ts";

async function main(): Promise<void> {
	const url = process.argv[2];
	if (!url?.startsWith("https://developer.apple.com/")) {
		logger.error("[seed-one] usage: bun run scripts/seed-one.ts <developer.apple.com URL>");
		process.exit(2);
	}

	const config = loadConfig();
	setLogLevel(config.logLevel);

	const sql = getSql(config.databaseUrl);
	const embedding = new EmbeddingService(
		{ baseUrl: config.embedding.baseUrl, apiKey: config.deepInfraApiKey },
		config.embedding.model,
	);

	try {
		await batchInsertUrls(sql, [url]);

		const checkedOut = await sql<{ id: string }[]>`
      UPDATE pages SET collect_count = collect_count + 1
      WHERE url = ${url}
      RETURNING id
    `;
		const id = checkedOut[0]?.id;
		if (!id) {
			logger.error(`[seed-one] page row not found after insert: ${url}`);
			process.exit(1);
		}

		let title: string | null = null;
		let content = "";
		let rawJson: string | null = null;

		if (isVideoUrl(url)) {
			const res = await fetchVideo(url);
			if (res.error || !res.data) {
				logger.error(`[seed-one] video fetch failed: ${res.error}`);
				process.exit(1);
			}
			title = res.data.title;
			content = res.data.content;
		} else {
			const res = await fetchDocumentJson(url);
			if (res.error || !res.data) {
				logger.error(`[seed-one] doc fetch failed: ${res.error}`);
				process.exit(1);
			}
			const doc = processDocument(res.data);
			title = doc.title;
			content = doc.content;
			rawJson = JSON.stringify(res.data);
		}

		const chunks = chunkText(content, title);
		const embeddings =
			chunks.length > 0
				? await embedding.createMany(
						chunks.map((c) => (c.title ? `${c.title}\n\n${c.content}` : c.content)),
					)
				: [];

		const chunkRows: ChunkRow[] = chunks.map((c, i) => ({
			url,
			title: c.title,
			content: c.content,
			embedding: embeddings[i] ?? [],
			chunk_index: c.chunk_index,
			total_chunks: c.total_chunks,
		}));

		await insertChunks(sql, chunkRows);
		await batchUpdatePages(sql, [{ id, title, content, raw_json: rawJson }]);

		logger.info(`[seed-one] ok: url=${url} chunks=${chunks.length} title=${JSON.stringify(title)}`);
	} finally {
		await closeSql();
	}
}

main().catch((e) => {
	logger.error(`[seed-one] failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
