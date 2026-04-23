/**
 * Environment parsing. Fails loud on startup if required vars are missing.
 *
 * Two supported deploy shapes:
 *   [1] Local-only: Ollama for embeddings at localhost, reranker disabled,
 *       no API key needed. Default.
 *   [2] Hosted: DeepInfra (or any OpenAI-compatible provider) for embeddings
 *       and reranker. Requires DEEPINFRA_API_KEY and non-zero RERANKER_ENABLED.
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
		readonly dim: number;
	};
	readonly reranker: {
		readonly enabled: boolean;
		readonly baseUrl: string;
		readonly primary: string;
		readonly fallback: string;
	};
}

const DEFAULTS = {
	port: 8787,
	logLevel: "info" as const,
	collectorBatchSize: 10,
	embeddingBaseUrl: "http://127.0.0.1:11434/v1",
	embeddingModel: "nomic-embed-text",
	embeddingDim: 768,
	rerankerBaseUrl: "https://api.deepinfra.com",
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

function parseBool(raw: string | undefined, fallback: boolean): boolean {
	if (raw === undefined) return fallback;
	const v = raw.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(v)) return true;
	if (["0", "false", "no", "off", ""].includes(v)) return false;
	throw new Error(`Expected boolean, got: ${raw}`);
}

function parseLogLevel(raw: string | undefined): Config["logLevel"] {
	const v = (raw || DEFAULTS.logLevel).toLowerCase();
	if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
	throw new Error(`LOG_LEVEL must be debug|info|warn|error, got: ${raw}`);
}

export function loadConfig(): Config {
	const rerankerEnabled = parseBool(process.env.RERANKER_ENABLED, false);

	// DeepInfra key is only required when a hosted reranker is enabled AND its
	// base URL points at a DeepInfra endpoint. Local Ollama flows never need it.
	const rerankerBaseUrl = process.env.RERANKER_BASE_URL?.trim() || DEFAULTS.rerankerBaseUrl;
	const needsKey = rerankerEnabled && rerankerBaseUrl.includes("deepinfra.com");

	return {
		port: parseIntOr("PORT", DEFAULTS.port),
		logLevel: parseLogLevel(process.env.LOG_LEVEL),
		databaseUrl: requireEnv("DATABASE_URL"),
		deepInfraApiKey: needsKey
			? requireEnv("DEEPINFRA_API_KEY")
			: (process.env.DEEPINFRA_API_KEY?.trim() ?? ""),
		collectorBatchSize: parseIntOr("COLLECTOR_BATCH_SIZE", DEFAULTS.collectorBatchSize),
		collectorAdminToken: process.env.COLLECTOR_ADMIN_TOKEN?.trim() || null,
		embedding: {
			baseUrl: process.env.EMBEDDING_BASE_URL?.trim() || DEFAULTS.embeddingBaseUrl,
			model: process.env.EMBEDDING_MODEL?.trim() || DEFAULTS.embeddingModel,
			dim: parseIntOr("EMBEDDING_DIM", DEFAULTS.embeddingDim),
		},
		reranker: {
			enabled: rerankerEnabled,
			baseUrl: rerankerBaseUrl,
			primary: process.env.RERANKER_MODEL_PRIMARY?.trim() || DEFAULTS.rerankerPrimary,
			fallback: process.env.RERANKER_MODEL_FALLBACK?.trim() || DEFAULTS.rerankerFallback,
		},
	};
}
