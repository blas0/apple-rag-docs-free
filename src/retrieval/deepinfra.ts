/**
 * DeepInfra REST client base. Single Bearer-keyed provider with retry.
 * Override base URL via EMBEDDING_BASE_URL / RERANKER_BASE_URL to point at any
 * OpenAI-compatible upstream.
 */

import { logger } from "../logger.ts";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "apple-rag-docs-free/0.1";

export interface DeepInfraOptions {
	readonly baseUrl: string;
	readonly apiKey: string;
}

export abstract class DeepInfraService<TIn, TRes, TOut> {
	protected abstract readonly endpoint: string;

	constructor(private readonly opts: DeepInfraOptions) {
		if (!opts.apiKey) throw new Error("DEEPINFRA_API_KEY is required");
	}

	protected async call(input: TIn, label: string): Promise<TOut> {
		const payload = this.buildPayload(input);
		const start = Date.now();
		let lastErr: Error = new Error("unreachable");

		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const res = await this.singleRequest(this.endpoint, payload);
				logger.debug(`${label} ok in ${Date.now() - start}ms (attempt ${attempt})`);
				return this.processResponse(res, input);
			} catch (e) {
				lastErr = e instanceof Error ? e : new Error(String(e));
				logger.warn(`${label} attempt ${attempt}/3 failed: ${lastErr.message}`);
			}
		}

		logger.error(`${label} failed after 3 attempts (${Date.now() - start}ms): ${lastErr.message}`);
		throw lastErr;
	}

	protected async singleRequest(endpoint: string, payload: unknown): Promise<TRes> {
		const res = await fetch(`${this.opts.baseUrl}${endpoint}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.opts.apiKey}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`upstream ${res.status}: ${body.slice(0, 200)}`);
		}

		return (await res.json()) as TRes;
	}

	protected abstract buildPayload(input: TIn): unknown;
	protected abstract processResponse(response: TRes, input: TIn): TOut;
}
