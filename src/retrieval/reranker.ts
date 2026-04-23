/**
 * Reranker: Qwen3-Reranker-8B primary, 4B fallback, 2 attempts each.
 */

import { logger } from "../logger.ts";
import { DeepInfraService } from "./deepinfra.ts";

interface RerankInput {
	readonly query: string;
	readonly documents: readonly string[];
	readonly topN: number;
}

interface RerankPayload {
	readonly queries: readonly [string];
	readonly documents: readonly string[];
	readonly top_n: number;
}

interface RerankResponse {
	readonly scores: readonly number[];
}

export interface RankedDocument {
	readonly content: string;
	readonly originalIndex: number;
	readonly relevanceScore: number;
}

const MAX_ATTEMPTS = 2;

export class RerankerService extends DeepInfraService<
	RerankInput,
	RerankResponse,
	RankedDocument[]
> {
	protected readonly endpoint: string;
	private readonly fallbackEndpoint: string;

	constructor(opts: { baseUrl: string; apiKey: string }, primary: string, fallback: string) {
		super(opts);
		this.endpoint = `/v1/inference/${primary}`;
		this.fallbackEndpoint = `/v1/inference/${fallback}`;
	}

	async rerank(
		query: string,
		documents: readonly string[],
		topN: number,
	): Promise<RankedDocument[]> {
		if (!query?.trim()) throw new Error("rerank: query is empty");
		if (!documents.length) throw new Error("rerank: no documents");

		const validTopN = Math.min(topN, documents.length);
		if (validTopN <= 0) throw new Error("rerank: topN must be > 0");

		const input: RerankInput = { query: query.trim(), documents, topN: validTopN };
		const payload = this.buildPayload(input);

		const started = Date.now();
		const errors: string[] = [];

		for (const [label, endpoint] of [
			["8B", this.endpoint],
			["4B", this.fallbackEndpoint],
		] as const) {
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				try {
					const res = await this.singleRequest(endpoint, payload);
					logger.debug(`rerank ${label} ok (${Date.now() - started}ms)`);
					return this.processResponse(res, input);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					errors.push(`${label}#${attempt}: ${msg}`);
					logger.warn(`rerank ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
				}
			}
		}

		throw new Error(`rerank failed: ${errors.join(" | ")}`);
	}

	protected buildPayload(input: RerankInput): RerankPayload {
		return { queries: [input.query], documents: input.documents, top_n: input.topN };
	}

	protected processResponse(res: RerankResponse, input: RerankInput): RankedDocument[] {
		if (!res.scores?.length) throw new Error("rerank: empty scores");

		const cap = Math.min(input.topN, res.scores.length, input.documents.length);

		return input.documents
			.map((content, i) => ({
				content,
				originalIndex: i,
				relevanceScore: res.scores[i] ?? 0,
			}))
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, cap);
	}
}
