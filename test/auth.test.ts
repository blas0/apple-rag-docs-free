import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { requireBearerToken } from "../src/mcp/auth.ts";

function buildApp(token: string | null) {
	const app = new Hono();
	app.use("/mcp", requireBearerToken(token));
	app.post("/mcp", (c) => c.json({ ok: true }));
	return app;
}

describe("requireBearerToken", () => {
	it("is a pass-through when no token is configured", async () => {
		const app = buildApp(null);
		const res = await app.request("/mcp", { method: "POST" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("401s requests missing an Authorization header", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", { method: "POST" });
		expect(res.status).toBe(401);
		expect(res.headers.get("www-authenticate")).toContain("Bearer");
		const body = (await res.json()) as { jsonrpc: string; error: { message: string } };
		expect(body.jsonrpc).toBe("2.0");
		expect(body.error.message).toBe("Unauthorized");
	});

	it("401s requests with a non-Bearer scheme", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", {
			method: "POST",
			headers: { Authorization: "Basic s3cret" },
		});
		expect(res.status).toBe(401);
	});

	it("401s requests with the wrong token", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", {
			method: "POST",
			headers: { Authorization: "Bearer wrongtoken" },
		});
		expect(res.status).toBe(401);
	});

	it("401s requests with a token of different length (timing-safe)", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", {
			method: "POST",
			headers: { Authorization: "Bearer s" },
		});
		expect(res.status).toBe(401);
	});

	it("allows requests with the correct token", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", {
			method: "POST",
			headers: { Authorization: "Bearer s3cret" },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("accepts the case-insensitive authorization header", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", {
			method: "POST",
			headers: { authorization: "Bearer s3cret" },
		});
		expect(res.status).toBe(200);
	});

	it("accepts a case-insensitive bearer scheme", async () => {
		const app = buildApp("s3cret");
		const res = await app.request("/mcp", {
			method: "POST",
			headers: { Authorization: "bearer s3cret" },
		});
		expect(res.status).toBe(200);
	});
});
