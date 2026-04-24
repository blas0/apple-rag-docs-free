/**
 * Optional bearer-token auth middleware for the MCP endpoint.
 *
 * If MCP_AUTH_TOKEN is set in the environment, every POST /mcp request must
 * carry `Authorization: Bearer <token>` with a matching value. Otherwise the
 * request is rejected with a JSON-RPC-shaped 401.
 *
 * When MCP_AUTH_TOKEN is unset, the middleware is a no-op. This keeps
 * local-dev UX unchanged while making the server safe to expose publicly.
 *
 * The compare is constant-time to prevent leaking the token via response
 * latency. The expected token is UTF-8 encoded once at middleware-construction
 * time, not per-request.
 */

import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { JSON_HEADERS, MCP_ERROR_CODES } from "./constants.ts";

const BEARER_RE = /^Bearer\s+(.+)$/i;

export function requireBearerToken(expected: string | null): MiddlewareHandler {
	if (expected === null) {
		// No-op pass-through. The conditional wiring lives here (not in server.ts)
		// so the call site never has to branch on whether auth is configured.
		return async (_c, next) => next();
	}

	const expectedBytes = new TextEncoder().encode(expected);

	return async (c, next) => {
		const header = c.req.header("authorization") ?? c.req.header("Authorization");
		const match = header?.match(BEARER_RE);
		const provided = match?.[1]?.trim();

		if (!provided || !constantTimeEqual(expectedBytes, new TextEncoder().encode(provided))) {
			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: MCP_ERROR_CODES.INVALID_REQUEST, message: "Unauthorized" },
				}),
				{
					status: 401,
					headers: { ...JSON_HEADERS, "WWW-Authenticate": 'Bearer realm="mcp"' },
				},
			);
		}

		return next();
	};
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	// timingSafeEqual requires equal-length inputs. Short-circuit mismatches
	// after a dummy compare so timing does not leak the expected length.
	if (a.length !== b.length) {
		// Compare a to itself so we still spend O(|a|) work on the wrong path.
		timingSafeEqual(a, a);
		return false;
	}
	return timingSafeEqual(a, b);
}
