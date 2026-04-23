/**
 * Environment parsing. Fails loud on startup if required vars are missing.
 */

export interface Config {
	readonly port: number;
	readonly logLevel: "debug" | "info" | "warn" | "error";
	readonly databaseUrl: string;
	readonly deepInfraApiKey: string;
	readonly collectorBatchSize: number;
	readonly collectorAdminToken: string | null;
	readonly embedding: {
		readonly baseUrl: string;
		readonly model: string;
	};
	readonly reranker: {
		readonly baseUrl: string;
		readonly primary: string;
		readonly fallback: string;
	};
}

const DEFAULTS = {
	port: 8787,
	logLevel: "info" as const,
	collectorBatchSize: 10,
	deepInfraBase: "https://api.deepinfra.com",
	embeddingModel: "Qwen/Qwen3-Embedding-4B",
	rerankerPrimary: "Qwen/Qwen3-Reranker-8B",
	rerankerFallback: "Qwen/Qwen3-Reranker-4B",
};

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v?.trim()) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return v;
}

function parseIntOr(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`Env var ${name} must be a positive integer, got: ${raw}`);
	}
	return n;
}

function parseLogLevel(raw: string | undefined): Config["logLevel"] {
	const v = (raw || DEFAULTS.logLevel).toLowerCase();
	if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
	throw new Error(`LOG_LEVEL must be debug|info|warn|error, got: ${raw}`);
}

export function loadConfig(): Config {
	return {
		port: parseIntOr("PORT", DEFAULTS.port),
		logLevel: parseLogLevel(process.env.LOG_LEVEL),
		databaseUrl: requireEnv("DATABASE_URL"),
		deepInfraApiKey: requireEnv("DEEPINFRA_API_KEY"),
		collectorBatchSize: parseIntOr("COLLECTOR_BATCH_SIZE", DEFAULTS.collectorBatchSize),
		collectorAdminToken: process.env.COLLECTOR_ADMIN_TOKEN?.trim() || null,
		embedding: {
			baseUrl: process.env.EMBEDDING_BASE_URL?.trim() || DEFAULTS.deepInfraBase,
			model: process.env.EMBEDDING_MODEL?.trim() || DEFAULTS.embeddingModel,
		},
		reranker: {
			baseUrl: process.env.RERANKER_BASE_URL?.trim() || DEFAULTS.deepInfraBase,
			primary: process.env.RERANKER_MODEL_PRIMARY?.trim() || DEFAULTS.rerankerPrimary,
			fallback: process.env.RERANKER_MODEL_FALLBACK?.trim() || DEFAULTS.rerankerFallback,
		},
	};
}
