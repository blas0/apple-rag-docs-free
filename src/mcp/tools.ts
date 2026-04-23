/**
 * Tool handlers: search + fetch. Each returns an MCP response directly.
 */

import { getPageByUrl } from "../retrieval/db.ts";
import { hybridSearch, type SearchEngineDeps } from "../retrieval/engine.ts";
import { MESSAGES, TOOLS } from "./constants.ts";
import {
	formatFetchResponse,
	formatRAGResponse,
	successTextResponse,
	toolErrorResponse,
} from "./formatters.ts";
import type { JsonRpcId, MCPResponse, ToolDefinition } from "./types.ts";

const SEARCH_SCHEMA: ToolDefinition["inputSchema"] = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	properties: {
		query: {
			type: "string",
			description:
				"Search query for Apple developer documentation. English, technical concepts, API/framework names, version numbers.",
			minLength: 1,
			maxLength: 10000,
		},
		result_count: {
			type: "number",
			description: "Number of results (1-10).",
			minimum: 1,
			maximum: 10,
			default: 4,
		},
	},
	required: ["query"],
};

const FETCH_SCHEMA: ToolDefinition["inputSchema"] = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	properties: {
		url: {
			type: "string",
			description: "URL of the Apple doc or WWDC video to retrieve.",
			minLength: 1,
		},
	},
	required: ["url"],
};

export function toolDefinitions(): readonly ToolDefinition[] {
	return [
		{ name: TOOLS.SEARCH.NAME, description: TOOLS.SEARCH.DESCRIPTION, inputSchema: SEARCH_SCHEMA },
		{ name: TOOLS.FETCH.NAME, description: TOOLS.FETCH.DESCRIPTION, inputSchema: FETCH_SCHEMA },
	];
}

export async function callTool(
	deps: SearchEngineDeps,
	id: JsonRpcId,
	name: string,
	args: Record<string, unknown>,
): Promise<MCPResponse> {
	switch (name) {
		case TOOLS.SEARCH.NAME:
			return handleSearch(deps, id, args);
		case TOOLS.FETCH.NAME:
			return handleFetch(deps, id, args);
		default:
			return toolErrorResponse(id, `${MESSAGES.UNKNOWN_TOOL}: ${name}`);
	}
}

async function handleSearch(
	deps: SearchEngineDeps,
	id: JsonRpcId,
	args: Record<string, unknown>,
): Promise<MCPResponse> {
	const query = args.query;
	if (typeof query !== "string" || !query.trim()) {
		return toolErrorResponse(id, MESSAGES.MISSING_QUERY);
	}

	let requested = 4;
	let wasAdjusted = false;
	const raw = args.result_count;
	if (typeof raw === "number" && Number.isFinite(raw)) {
		if (raw < 1) {
			requested = 1;
			wasAdjusted = true;
		} else if (raw > 10) {
			requested = 10;
			wasAdjusted = true;
		} else {
			requested = Math.round(raw);
			if (requested !== raw) wasAdjusted = true;
		}
	} else if (raw !== undefined) {
		wasAdjusted = true;
	}

	try {
		const result = await hybridSearch(deps, query, requested);
		return successTextResponse(id, formatRAGResponse(result, wasAdjusted));
	} catch {
		return toolErrorResponse(id, MESSAGES.SEARCH_FAILED);
	}
}

async function handleFetch(
	deps: SearchEngineDeps,
	id: JsonRpcId,
	args: Record<string, unknown>,
): Promise<MCPResponse> {
	const url = args.url;
	if (typeof url !== "string" || !url.trim()) {
		return toolErrorResponse(id, MESSAGES.MISSING_URL);
	}

	try {
		const page = await getPageByUrl(deps.sql, url.trim());
		if (!page) return toolErrorResponse(id, `No content found for URL: ${url}`);
		return successTextResponse(
			id,
			formatFetchResponse({ title: page.title, content: page.content }),
		);
	} catch {
		return toolErrorResponse(id, MESSAGES.FETCH_FAILED);
	}
}
