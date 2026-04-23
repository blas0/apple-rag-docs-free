/**
 * MCP server identity + protocol constants.
 */

export const SERVER_NAME = "apple-rag-docs-free";
export const SERVER_VERSION = "0.1.0";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const SUPPORTED_MCP_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

export const MCP_ERROR_CODES = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	RATE_LIMIT_EXCEEDED: -32003,
} as const;

export const TOOLS = {
	SEARCH: {
		NAME: "search",
		DESCRIPTION:
			"Search Apple's official developer documentation and video content using hybrid RAG. Returns relevant content from Apple's technical documentation, frameworks, APIs, design guidelines, and WWDC video transcripts.",
	},
	FETCH: {
		NAME: "fetch",
		DESCRIPTION:
			"Retrieve complete cleaned content for a specific Apple developer documentation page or WWDC video transcript by URL.",
	},
} as const;

export const MESSAGES = {
	NO_RESULTS: "No matching content found in Apple's developer documentation for this search.",
	UNKNOWN_TOOL: "Unknown tool",
	MISSING_QUERY: "Missing or invalid 'query' parameter",
	MISSING_URL: "URL parameter is required and must be a non-empty string",
	SEARCH_FAILED: "Failed to process search",
	FETCH_FAILED: "Failed to fetch content from the specified URL",
} as const;

export const SERVER_MANIFEST = {
	name: "apple-rag-docs-free",
	title: "Apple Developer Documentation Search (self-hosted)",
	version: SERVER_VERSION,
	description:
		"Self-hostable MCP server providing hybrid search over Apple's developer documentation and WWDC video transcripts.",
	protocolVersion: MCP_PROTOCOL_VERSION,
	supportedVersions: SUPPORTED_MCP_VERSIONS,
	capabilities: {
		tools: { listChanged: false },
		logging: {},
	},
	serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
	transport: {
		type: "streamable-http",
		methods: ["POST"],
		headers: {
			required: ["Content-Type"],
			optional: ["Authorization", "MCP-Protocol-Version"],
		},
	},
} as const;

export const JSON_HEADERS = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
} as const;
