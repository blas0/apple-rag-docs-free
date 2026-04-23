/**
 * Text rendering for tool responses and the standard JSON-RPC envelopes.
 */

import type { EngineResult } from "../retrieval/engine.ts";
import { MESSAGES } from "./constants.ts";
import type { JsonRpcId, MCPResponse } from "./types.ts";

const SEPARATOR = "─".repeat(80);
const SUBSEP = "─".repeat(60);

export function formatRAGResponse(result: EngineResult, wasAdjusted: boolean): string {
	if (!result.results.length) return MESSAGES.NO_RESULTS;

	const parts: string[] = [];

	result.results.forEach((r, idx) => {
		const heading = formatResultHeading(idx, r);
		const hint = formatCompletenessHint(r);
		const body = [heading, "", ...(hint ? [hint, ""] : []), r.content].join("\n");
		parts.push(body);
	});

	let out = parts.join(`\n\n${SEPARATOR}\n\n`);

	if (result.additionalUrls.length > 0) {
		out += `\n\n${SUBSEP}\n\n`;
		out += "Additional Related Documentation:\n";
		out += `The following ${result.additionalUrls.length} URLs contain supplementary content. Use the \`fetch\` tool to retrieve their full cleaned text:\n\n`;
		for (const item of result.additionalUrls) {
			out += `${item.url}\n`;
			if (item.title && item.url.includes("developer.apple.com/videos/play/")) {
				out += `  └─ ${item.title}\n`;
			}
			out += `  └─ ${item.characterCount} characters\n\n`;
		}
	}

	if (wasAdjusted) {
		out +=
			"\n\nNote: result_count accepts values between 1 and 10; out-of-range values were clamped.";
	}

	return out;
}

function formatResultHeading(idx: number, r: EngineResult["results"][number]): string {
	const title = r.title || "Untitled";
	return `[${idx + 1}] ${title}`;
}

function formatCompletenessHint(r: EngineResult["results"][number]): string {
	if (r.total_chunks === 1) return "[*] Complete Document";

	if (r.mergedChunkIndices && r.mergedChunkIndices.length > 1) {
		const parts = r.mergedChunkIndices.map((i) => i + 1).join(", ");
		return [
			`[*] Parts ${parts} merged (${r.total_chunks} total)`,
			"This shows merged content from multiple parts. For the complete document, call:",
			`fetch(url: "${r.url}")`,
		].join("\n");
	}

	return [
		`[*] Part ${r.chunk_index + 1} of ${r.total_chunks}`,
		"This is a partial document. For the complete content, call:",
		`fetch(url: "${r.url}")`,
	].join("\n");
}

export function formatFetchResponse(row: {
	readonly title: string | null;
	readonly content: string;
}): string {
	const pieces: string[] = [];
	if (row.title) pieces.push(row.title, "");
	if (row.content) pieces.push(row.content);
	return pieces.join("\n");
}

export function successTextResponse(id: JsonRpcId, text: string): MCPResponse {
	return {
		jsonrpc: "2.0",
		id,
		result: { content: [{ type: "text", text }] },
	};
}

export function toolErrorResponse(id: JsonRpcId, message: string): MCPResponse {
	return {
		jsonrpc: "2.0",
		id,
		result: { isError: true, content: [{ type: "text", text: message }] },
	};
}

export function errorResponse(id: JsonRpcId | null, code: number, message: string): MCPResponse {
	return { jsonrpc: "2.0", id, error: { code, message } };
}
