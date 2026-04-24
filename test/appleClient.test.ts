import { describe, expect, it } from "bun:test";
import { discoverDocUrls, isVideoUrl } from "../src/collector/appleClient.ts";

describe("discoverDocUrls", () => {
	const urls = discoverDocUrls();

	it("returns a non-empty list of framework roots", () => {
		expect(urls.length).toBeGreaterThan(20);
	});

	it("emits absolute, no-trailing-slash developer.apple.com URLs", () => {
		for (const u of urls) {
			expect(u.startsWith("https://developer.apple.com/documentation/")).toBe(true);
			expect(u.endsWith("/")).toBe(false);
		}
	});

	it("has no duplicates", () => {
		expect(new Set(urls).size).toBe(urls.length);
	});

	it("does not overlap with the video URL space", () => {
		for (const u of urls) expect(isVideoUrl(u)).toBe(false);
	});

	it("covers the core Swift/SwiftUI/Foundation trio", () => {
		expect(urls).toContain("https://developer.apple.com/documentation/swiftui");
		expect(urls).toContain("https://developer.apple.com/documentation/foundation");
		expect(urls).toContain("https://developer.apple.com/documentation/swift");
	});
});
