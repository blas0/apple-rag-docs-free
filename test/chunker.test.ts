import { describe, expect, it } from "bun:test";
import { chunkText } from "../src/collector/chunker.ts";

describe("chunkText", () => {
	it("returns empty array for empty input", () => {
		expect(chunkText("", "Title")).toEqual([]);
		expect(chunkText("   \n  ", "Title")).toEqual([]);
	});

	it("returns a single chunk for short text", () => {
		const chunks = chunkText("This is a short document.", "Hello");
		expect(chunks.length).toBe(1);
		expect(chunks[0]?.title).toBe("Hello");
		expect(chunks[0]?.chunk_index).toBe(0);
		expect(chunks[0]?.total_chunks).toBe(1);
		expect(chunks[0]?.content).toContain("short document");
	});

	it("splits long text into multiple chunks with consistent metadata", () => {
		const body = `${"x".repeat(2400)}\n\n${"y".repeat(2400)}\n\n${"z".repeat(2400)}`;
		const chunks = chunkText(body, "Long");
		expect(chunks.length).toBeGreaterThan(1);
		for (let i = 0; i < chunks.length; i++) {
			expect(chunks[i]?.chunk_index).toBe(i);
			expect(chunks[i]?.total_chunks).toBe(chunks.length);
		}
	});

	it("preserves a null title as null", () => {
		const [chunk] = chunkText("hello world", null);
		expect(chunk?.title).toBeNull();
	});
});
