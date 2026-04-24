/**
 * Embeddings over any OpenAI-compatible endpoint. Default: local Ollama
 * (http://127.0.0.1:11434/v1) with nomic-embed-text.
 *
 * EMBEDDING_BASE_URL should already include the provider's version prefix
 * (e.g. "/v1" for Ollama, "/v1/openai" for DeepInfra); this class appends
 * "/embeddings" onto it.
 *
 * L2-normalizes client-side so pgvector cosine distance behaves consistently
 * across providers that do and don't pre-normalize.
 */

import { logger } from "../logger.ts";
import { DeepInfraService } from "./deepinfra.ts";

interface EmbeddingPayload {
	readonly model: string;
	readonly input: string | string[];
	readonly encoding_format: "float";
}

interface EmbeddingResponse {
	readonly data: ReadonlyArray<{ readonly embedding: number[] }>;
}

export class EmbeddingService extends DeepInfraService<
	string | string[],
	EmbeddingResponse,
	number[][]
> {
	protected readonly endpoint = "/embeddings";

	constructor(
		opts: { baseUrl: string; apiKey: string },
		private readonly model: string,
	) {
		super(opts);
	}

	async createOne(text: string): Promise<number[]> {
		if (!text?.trim()) throw new Error("embedding input must be non-empty");
		const [vec] = await this.call(text.trim(), "embedding(1)");
		if (!vec) throw new Error("embedding provider returned empty response");
		return vec;
	}

	async createMany(texts: readonly string[]): Promise<number[][]> {
		if (!texts.length) return [];
		const cleaned = texts.map((t) => t.trim()).filter((t) => t.length > 0);
		if (cleaned.length !== texts.length) {
			throw new Error("all embedding inputs must be non-empty");
		}
		return this.call(cleaned, `embedding(${cleaned.length})`);
	}

	protected buildPayload(input: string | string[]): EmbeddingPayload {
		return { model: this.model, input, encoding_format: "float" };
	}

	protected processResponse(res: EmbeddingResponse, input: string | string[]): number[][] {
		const expected = Array.isArray(input) ? input.length : 1;
		const data = res.data ?? [];
		if (data.length !== expected) {
			throw new Error(`embedding count mismatch: got ${data.length}, expected ${expected}`);
		}
		return data.map((d) => {
			if (!Array.isArray(d.embedding) || d.embedding.length === 0) {
				throw new Error("malformed embedding row");
			}
			return normalizeL2(d.embedding);
		});
	}
}

function normalizeL2(vec: readonly number[]): number[] {
	let sum = 0;
	for (const v of vec) sum += v * v;
	const norm = Math.sqrt(sum);
	if (norm === 0) {
		logger.warn("zero-norm embedding; returning unnormalized");
		return [...vec];
	}
	const out = new Array<number>(vec.length);
	for (let i = 0; i < vec.length; i++) out[i] = (vec[i] as number) / norm;
	return out;
}
