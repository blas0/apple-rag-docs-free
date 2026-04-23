/**
 * Dependency container. Built once per process; fed into every request.
 */

import type { Config } from "./config.ts";
import { getSql } from "./db/client.ts";
import { EmbeddingService } from "./retrieval/embedding.ts";
import type { SearchEngineDeps } from "./retrieval/engine.ts";
import { RerankerService } from "./retrieval/reranker.ts";

export function buildServices(config: Config): SearchEngineDeps {
	const sql = getSql(config.databaseUrl);

	const embedding = new EmbeddingService(
		{ baseUrl: config.embedding.baseUrl, apiKey: config.deepInfraApiKey },
		config.embedding.model,
	);

	const reranker = new RerankerService(
		{ baseUrl: config.reranker.baseUrl, apiKey: config.deepInfraApiKey },
		config.reranker.primary,
		config.reranker.fallback,
	);

	return { sql, embedding, reranker };
}
