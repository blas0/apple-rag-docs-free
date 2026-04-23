/**
 * JSON-RPC 2.0 handler for Streamable HTTP transport. POST-only, no SSE.
 */

import { logger } from "../logger.ts";
import type { SearchEngineDeps } from "../retrieval/engine.ts";
import {
	MCP_ERROR_CODES,
	MCP_PROTOCOL_VERSION,
	SERVER_NAME,
	SERVER_VERSION,
	SUPPORTED_MCP_VERSIONS,
} from "./constants.ts";
import { errorResponse } from "./formatters.ts";
import { callTool, toolDefinitions } from "./tools.ts";
import { isNotification, isRequest, type JsonRpcId, type MCPResponse } from "./types.ts";

export interface HandleResult {
	readonly status: number;
	readonly body: MCPResponse | null;
}

export async function handleJsonRpc(
	deps: SearchEngineDeps,
	bodyText: string,
	headerVersion: string | null,
): Promise<HandleResult> {
	let body: unknown;
	try {
		body = JSON.parse(bodyText);
	} catch {
		return { status: 400, body: errorResponse(null, MCP_ERROR_CODES.PARSE_ERROR, "Parse error") };
	}

	if (isNotification(body)) {
		logger.debug(`notification: ${body.method}`);
		return { status: 202, body: null };
	}

	if (!isRequest(body)) {
		return {
			status: 400,
			body: errorResponse(null, MCP_ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC request"),
		};
	}

	if (body.method !== "initialize") {
		const err = validateProtocolHeader(headerVersion);
		if (err) return { status: 400, body: errorResponse(body.id, err.code, err.message) };
	}

	try {
		const response = await dispatch(deps, body.id, body.method, body.params);
		return { status: 200, body: response };
	} catch (e) {
		logger.error(`dispatch failed for ${body.method}: ${e instanceof Error ? e.message : e}`);
		return {
			status: 200,
			body: errorResponse(body.id, MCP_ERROR_CODES.INTERNAL_ERROR, "Internal server error"),
		};
	}
}

async function dispatch(
	deps: SearchEngineDeps,
	id: JsonRpcId,
	method: string,
	params: Record<string, unknown> | undefined,
): Promise<MCPResponse> {
	switch (method) {
		case "initialize":
			return initialize(id, params);
		case "tools/list":
			return { jsonrpc: "2.0", id, result: { tools: toolDefinitions() } };
		case "tools/call":
			return callToolRpc(deps, id, params);
		default:
			return errorResponse(id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`);
	}
}

function initialize(id: JsonRpcId, params: Record<string, unknown> | undefined): MCPResponse {
	const clientProtocol =
		typeof params?.protocolVersion === "string" ? params.protocolVersion : null;
	if (
		clientProtocol &&
		!SUPPORTED_MCP_VERSIONS.includes(clientProtocol as (typeof SUPPORTED_MCP_VERSIONS)[number])
	) {
		logger.warn(`unsupported protocol version from client: ${clientProtocol}`);
	}
	return {
		jsonrpc: "2.0",
		id,
		result: {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: { tools: {} },
			serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
		},
	};
}

async function callToolRpc(
	deps: SearchEngineDeps,
	id: JsonRpcId,
	params: Record<string, unknown> | undefined,
): Promise<MCPResponse> {
	if (!params || typeof params !== "object") {
		return errorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "tools/call requires params");
	}

	const name = params.name;
	if (typeof name !== "string" || !name) {
		return errorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "tools/call: name is required");
	}

	const rawArgs = params.arguments;
	const args: Record<string, unknown> =
		rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};

	return callTool(deps, id, name, args);
}

function validateProtocolHeader(header: string | null): { code: number; message: string } | null {
	if (!header) return null;
	if (!SUPPORTED_MCP_VERSIONS.includes(header as (typeof SUPPORTED_MCP_VERSIONS)[number])) {
		return {
			code: MCP_ERROR_CODES.INVALID_REQUEST,
			message: `Unsupported MCP-Protocol-Version: ${header}`,
		};
	}
	return null;
}
