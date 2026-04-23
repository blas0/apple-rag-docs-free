import { describe, expect, it } from "bun:test";
import { formatFetchResponse, formatRAGResponse } from "../src/mcp/formatters.ts";

describe("formatFetchResponse", () => {
	it("prepends title and blank line when present", () => {
		const out = formatFetchResponse({ title: "Hello", content: "World" });
		expect(out).toBe("Hello\n\nWorld");
	});

	it("returns content alone when title is absent", () => {
		const out = formatFetchResponse({ title: null, content: "just content" });
		expect(out).toBe("just content");
	});
});

describe("formatRAGResponse", () => {
	it("renders an empty-results message cleanly", () => {
		const out = formatRAGResponse({ results: [], additionalUrls: [] }, false);
		expect(typeof out).toBe("string");
		expect(out.length).toBeGreaterThan(0);
	});

	it("renders a single complete result with the completeness hint", () => {
		const out = formatRAGResponse(
			{
				results: [
					{
						id: "r1",
						url: "https://developer.apple.com/documentation/swift",
						title: "Swift Syntax",
						content: "body",
						chunk_index: 0,
						total_chunks: 1,
					},
				],
				additionalUrls: [],
			},
			false,
		);
		expect(out).toContain("Swift Syntax");
		expect(out).toContain("Complete Document");
	});

	it("appends adjustment notice when wasAdjusted is true", () => {
		const out = formatRAGResponse({ results: [], additionalUrls: [] }, true);
		// With zero results we short-circuit to the no-results message;
		// the adjustment notice only applies on non-empty output.
		expect(out).not.toContain("clamped");

		const withResults = formatRAGResponse(
			{
				results: [
					{
						id: "r1",
						url: "https://developer.apple.com/x",
						title: "X",
						content: "c",
						chunk_index: 0,
						total_chunks: 1,
					},
				],
				additionalUrls: [],
			},
			true,
		);
		expect(withResults).toContain("clamped");
	});
});
