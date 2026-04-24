/**
 * Collector orchestration. One execute() call:
 *   1. check out a batch of URLs (lowest collect_count first)
 *   2. fetch raw content (JSON for docs, HTML transcripts for videos)
 *   3. convert to markdown + extract new URLs to enqueue
 *   4. chunk -> embed -> upsert into pages + chunks
 *   5. hard-delete URLs that returned a permanent error (403/404/410/empty)
 *
 * Unlike upstream we always force-rewrite on success: no content-diff
 * short-circuit. The simpler invariant (latest fetch wins) is easier to reason
 * about for self-hosters and avoids dragging in the whole comparison machinery.
 */

import type { Sql } from "postgres";
import { logger } from "../logger.ts";
import type { EmbeddingService } from "../retrieval/embedding.ts";
import {
	discoverDocUrls,
	discoverVideoUrls,
	fetchDocumentJson,
	fetchVideo,
	isVideoUrl,
} from "./appleClient.ts";
import { chunkText } from "./chunker.ts";
import { processDocument } from "./contentProcessor.ts";
import {
	batchInsertUrls,
	batchUpdatePages,
	type ChunkRow,
	deleteRecords,
	getBatchRecords,
	insertChunks,
	type PageRecord,
	type PageUpdate,
} from "./pg.ts";

export interface CollectorDeps {
	readonly sql: Sql;
	readonly embedding: EmbeddingService;
}

export interface BatchSummary {
	readonly processed: number;
	readonly updated: number;
	readonly deleted: number;
	readonly chunks: number;
	readonly enqueued: number;
	readonly temporaryErrors: number;
}

export async function discoverVideos(deps: CollectorDeps): Promise<number> {
	const urls = await discoverVideoUrls();
	const added = await batchInsertUrls(deps.sql, urls);
	if (added > 0) logger.info(`[collector] discovered ${added} new video URL(s)`);
	return added;
}

export async function discoverDocs(deps: CollectorDeps): Promise<number> {
	const urls = discoverDocUrls();
	const added = await batchInsertUrls(deps.sql, urls);
	if (added > 0) logger.info(`[collector] seeded ${added} framework root URL(s)`);
	return added;
}

export async function runBatch(deps: CollectorDeps, batchSize: number): Promise<BatchSummary> {
	const records = await getBatchRecords(deps.sql, batchSize);
	if (records.length === 0) {
		return { processed: 0, updated: 0, deleted: 0, chunks: 0, enqueued: 0, temporaryErrors: 0 };
	}

	logger.info(`[collector] batch of ${records.length} URL(s) checked out`);

	interface Processed {
		readonly record: PageRecord;
		readonly title: string | null;
		readonly content: string;
		readonly rawJson: string | null;
		readonly extractedUrls: readonly string[];
	}

	const processed: Processed[] = [];
	const deleteIds: string[] = [];
	let temporaryErrors = 0;

	await Promise.all(
		records.map(async (record) => {
			try {
				if (isVideoUrl(record.url)) {
					const result = await fetchVideo(record.url);
					if (result.error || !result.data) {
						handleFetchFailure(record, result.error, result.permanent, deleteIds);
						if (!result.permanent) temporaryErrors++;
						return;
					}
					processed.push({
						record,
						title: result.data.title,
						content: result.data.content,
						rawJson: null,
						extractedUrls: [],
					});
					return;
				}

				const result = await fetchDocumentJson(record.url);
				if (result.error || !result.data) {
					handleFetchFailure(record, result.error, result.permanent, deleteIds);
					if (!result.permanent) temporaryErrors++;
					return;
				}

				const doc = processDocument(result.data);
				processed.push({
					record,
					title: doc.title,
					content: doc.content,
					rawJson: JSON.stringify(result.data),
					extractedUrls: doc.extractedUrls,
				});
			} catch (e) {
				logger.warn(
					`[collector] unexpected error for ${record.url}: ${e instanceof Error ? e.message : String(e)}`,
				);
				temporaryErrors++;
			}
		}),
	);

	const allChunks: (ChunkRow & { readonly ord: number })[] = [];
	const chunkTexts: string[] = [];
	for (const p of processed) {
		const chunks = chunkText(p.content, p.title);
		for (const c of chunks) {
			const ord = allChunks.length;
			allChunks.push({
				url: p.record.url,
				title: c.title,
				content: c.content,
				embedding: [],
				chunk_index: c.chunk_index,
				total_chunks: c.total_chunks,
				ord,
			});
			chunkTexts.push(c.title ? `${c.title}\n\n${c.content}` : c.content);
		}
	}

	const embeddings = chunkTexts.length > 0 ? await deps.embedding.createMany(chunkTexts) : [];
	const materializedChunks: ChunkRow[] = allChunks.map((c) => ({
		url: c.url,
		title: c.title,
		content: c.content,
		embedding: embeddings[c.ord] ?? [],
		chunk_index: c.chunk_index,
		total_chunks: c.total_chunks,
	}));

	await insertChunks(deps.sql, materializedChunks);

	const pageUpdates: PageUpdate[] = processed.map((p) => ({
		id: p.record.id,
		title: p.title,
		content: p.content,
		raw_json: p.rawJson,
	}));
	await batchUpdatePages(deps.sql, pageUpdates);

	await deleteRecords(deps.sql, deleteIds);

	const extracted = new Set<string>();
	for (const p of processed) for (const u of p.extractedUrls) extracted.add(u);
	const enqueued = extracted.size > 0 ? await batchInsertUrls(deps.sql, [...extracted]) : 0;

	return {
		processed: records.length,
		updated: processed.length,
		deleted: deleteIds.length,
		chunks: materializedChunks.length,
		enqueued,
		temporaryErrors,
	};
}

function handleFetchFailure(
	record: PageRecord,
	error: string | undefined,
	permanent: boolean | undefined,
	deleteIds: string[],
): void {
	const label = error ?? "unknown error";
	if (permanent) {
		logger.info(`[collector] permanent error on ${record.url} (${label}); scheduling delete`);
		deleteIds.push(record.id);
	} else {
		logger.warn(`[collector] temporary error on ${record.url}: ${label}`);
	}
}
