/**
 * Hybrid search engine. 4k + 4k candidate merge, title-group, rerank.
 * Mirrors the upstream pipeline so response shape stays client-compatible.
 */

import type { Sql } from "../db/client.ts";
import { logger } from "../logger.ts";
import { keywordSearch, type SearchHit, semanticSearch } from "./db.ts";
import type { EmbeddingService } from "./embedding.ts";
import type { RerankerService } from "./reranker.ts";

export interface AdditionalUrl {
	readonly url: string;
	readonly title: string | null;
	readonly characterCount: number;
}

export interface MergedResult {
	readonly id: string;
	readonly url: string;
	readonly title: string;
	readonly content: string;
	readonly chunk_index: number;
	readonly total_chunks: number;
	readonly mergedChunkIndices?: readonly number[];
}

export interface EngineResult {
	readonly results: readonly MergedResult[];
	readonly additionalUrls: readonly AdditionalUrl[];
}

interface ProcessedCandidate extends MergedResult {
	readonly contentLength: number;
}

export interface SearchEngineDeps {
	readonly sql: Sql;
	readonly embedding: EmbeddingService;
	readonly reranker: RerankerService | null;
}

export async function hybridSearch(
	deps: SearchEngineDeps,
	rawQuery: string,
	resultCount: number,
): Promise<EngineResult> {
	const query = rawQuery.trim();
	const k = Math.min(Math.max(resultCount, 1), 20);
	const candidateCount = k * 4;

	const [semantic, keyword] = await Promise.all([
		getSemanticCandidates(deps, query, candidateCount),
		getKeywordCandidates(deps.sql, query, candidateCount),
	]);

	const merged = dedupeById(semantic, keyword);
	const processed = mergeByTitle(merged);

	const reranked = await tryRerank(deps.reranker, query, processed, k);

	const finalUrls = new Set(reranked.map((r) => r.url));
	const additionalUrls: AdditionalUrl[] = [];
	for (const p of processed) {
		if (finalUrls.has(p.url)) continue;
		if (additionalUrls.some((u) => u.url === p.url)) continue;
		additionalUrls.push({ url: p.url, title: p.title, characterCount: p.contentLength });
		if (additionalUrls.length >= 10) break;
	}

	return { results: reranked, additionalUrls };
}

async function getSemanticCandidates(
	deps: SearchEngineDeps,
	query: string,
	n: number,
): Promise<SearchHit[]> {
	try {
		const vec = await deps.embedding.createOne(query);
		return await semanticSearch(deps.sql, vec, n);
	} catch (err) {
		logger.warn(`semantic candidates failed: ${err instanceof Error ? err.message : err}`);
		return [];
	}
}

async function getKeywordCandidates(sql: Sql, query: string, n: number): Promise<SearchHit[]> {
	try {
		return await keywordSearch(sql, query, n);
	} catch (err) {
		logger.warn(`keyword candidates failed: ${err instanceof Error ? err.message : err}`);
		return [];
	}
}

function dedupeById(a: readonly SearchHit[], b: readonly SearchHit[]): SearchHit[] {
	const seen = new Set<string>();
	const out: SearchHit[] = [];
	for (const list of [a, b]) {
		for (const hit of list) {
			if (seen.has(hit.id)) continue;
			seen.add(hit.id);
			out.push(hit);
		}
	}
	return out;
}

function mergeByTitle(hits: readonly SearchHit[]): ProcessedCandidate[] {
	const groups = new Map<string, SearchHit[]>();
	for (const h of hits) {
		const key = h.title || "untitled";
		const bucket = groups.get(key) ?? [];
		bucket.push(h);
		groups.set(key, bucket);
	}

	const out: ProcessedCandidate[] = [];
	for (const [title, group] of groups) {
		const sorted = [...group].sort((x, y) => x.chunk_index - y.chunk_index);
		const head = sorted[0];
		if (!head) continue;
		const indices = sorted.map((r) => r.chunk_index);
		const totalChunks = head.total_chunks;

		const content = sorted.map((r) => r.content).join("\n\n---\n\n");
		const isComplete = indices.length === totalChunks && indices.every((idx, i) => idx === i);

		let chunk_index: number;
		let total_chunks: number;
		if (indices.length === 1) {
			chunk_index = indices[0] as number;
			total_chunks = totalChunks;
		} else if (isComplete) {
			chunk_index = 0;
			total_chunks = 1;
		} else {
			chunk_index = Math.min(...indices);
			total_chunks = totalChunks;
		}

		out.push({
			id: head.id,
			url: head.url,
			title: title === "untitled" ? "" : title,
			content,
			chunk_index,
			total_chunks,
			mergedChunkIndices: indices.length > 1 ? indices : undefined,
			contentLength: content.length,
		});
	}

	return out;
}

async function tryRerank(
	reranker: RerankerService | null,
	query: string,
	processed: readonly ProcessedCandidate[],
	k: number,
): Promise<MergedResult[]> {
	if (processed.length === 0) return [];

	const target = Math.min(k, processed.length);

	if (!reranker) {
		return processed.slice(0, target).map(toMergedResult);
	}

	try {
		const ranked = await reranker.rerank(
			query,
			processed.map((p) => p.content),
			target,
		);
		return ranked.map((doc) => {
			const p = processed[doc.originalIndex];
			if (!p) throw new Error("reranker returned invalid index");
			return toMergedResult(p);
		});
	} catch (err) {
		logger.warn(
			`reranker failed; falling back to merge order (${err instanceof Error ? err.message : err})`,
		);
		return processed.slice(0, target).map(toMergedResult);
	}
}

function toMergedResult(p: ProcessedCandidate): MergedResult {
	return {
		id: p.id,
		url: p.url,
		title: p.title,
		content: p.content,
		chunk_index: p.chunk_index,
		total_chunks: p.total_chunks,
		mergedChunkIndices: p.mergedChunkIndices,
	};
}
