/**
 * HTTP entrypoint. Hono on Bun. POST /mcp is the JSON-RPC surface.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig } from "./config.ts";
import { logger, setLogLevel } from "./logger.ts";
import { JSON_HEADERS, MCP_ERROR_CODES, SERVER_MANIFEST, SERVER_VERSION } from "./mcp/constants.ts";
import { handleJsonRpc } from "./mcp/protocol.ts";
import { buildServices } from "./services.ts";

const config = loadConfig();
setLogLevel(config.logLevel);
const services = buildServices(config);

const app = new Hono();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "MCP-Protocol-Version"],
	}),
);

app.onError((err, c) => {
	logger.error(`unhandled: ${err instanceof Error ? err.message : String(err)}`);
	return c.json(
		{
			jsonrpc: "2.0",
			id: null,
			error: { code: MCP_ERROR_CODES.INTERNAL_ERROR, message: "Internal server error" },
		},
		500,
	);
});

app.get("/", (c) =>
	c.json({
		service: "apple-rag-docs-free",
		version: SERVER_VERSION,
		mcp: "/mcp",
		health: "/health",
		manifest: "/manifest",
	}),
);

app.get("/health", (c) =>
	c.json({ status: "healthy", version: SERVER_VERSION, timestamp: new Date().toISOString() }),
);

app.get("/manifest", (c) =>
	c.json(SERVER_MANIFEST, 200, { "Cache-Control": "public, max-age=3600" }),
);

app.post("/mcp", async (c) => {
	const contentType = c.req.header("content-type");
	if (!contentType?.includes("application/json")) {
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				id: null,
				error: {
					code: MCP_ERROR_CODES.INVALID_REQUEST,
					message: "Content-Type must be application/json",
				},
			}),
			{ status: 400, headers: JSON_HEADERS },
		);
	}

	const bodyText = await c.req.text();
	const result = await handleJsonRpc(
		services,
		bodyText,
		c.req.header("MCP-Protocol-Version") ?? null,
	);

	if (result.body === null) {
		return new Response(null, {
			status: result.status,
			headers: { "Access-Control-Allow-Origin": "*" },
		});
	}

	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: JSON_HEADERS,
	});
});

app.on(["GET", "DELETE"], "/mcp", (c) =>
	c.text("Method Not Allowed", 405, { Allow: "POST, OPTIONS" }),
);

logger.info(`apple-rag-docs-free v${SERVER_VERSION} listening on :${config.port}`);

export default {
	port: config.port,
	fetch: app.fetch,
};
