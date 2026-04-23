/**
 * JSON-RPC 2.0 + MCP tool shapes. Narrow enough to catch bad clients at parse time.
 */

export type JsonRpcId = string | number;

export interface MCPRequest {
	readonly jsonrpc: "2.0";
	readonly id: JsonRpcId;
	readonly method: string;
	readonly params?: Record<string, unknown>;
}

export interface MCPNotification {
	readonly jsonrpc: "2.0";
	readonly method: string;
	readonly params?: Record<string, unknown>;
}

export interface MCPError {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}

export interface MCPResponse {
	readonly jsonrpc: "2.0";
	readonly id: JsonRpcId | null;
	readonly result?: unknown;
	readonly error?: MCPError;
}

export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown>;
}

export interface ToolCallParams {
	readonly name: string;
	readonly arguments: Record<string, unknown>;
}

export function isRequest(body: unknown): body is MCPRequest {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	return (
		b.jsonrpc === "2.0" &&
		(typeof b.id === "string" || typeof b.id === "number") &&
		typeof b.method === "string"
	);
}

export function isNotification(body: unknown): body is MCPNotification {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	return b.jsonrpc === "2.0" && typeof b.method === "string" && !("id" in b);
}
