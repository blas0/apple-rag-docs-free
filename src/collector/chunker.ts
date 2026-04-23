/**
 * Dynamic-size chunker targeting ~2500 chars, splitting on header/paragraph/
 * sentence boundaries near the target position. Ports the behavior of the
 * upstream apple-rag-mcp chunker so retrieval stays compatible.
 */

const TARGET_CHUNK_SIZE = 2500;
const SEARCH_RANGE = 250;

// Priority list of split markers near the target position. First match wins.
const SPLIT_PATTERNS: ReadonlyArray<readonly [string, number]> = [
	["# ", 2],
	["## ", 3],
	["### ", 4],
	["\n\n", 2],
	["\n", 1],
	[".", 1],
];

export interface Chunk {
	readonly title: string | null;
	readonly content: string;
	readonly chunk_index: number;
	readonly total_chunks: number;
}

export function chunkText(text: string, title: string | null): Chunk[] {
	const body = text;
	if (!body.trim()) return [];

	const targetCount = Math.max(1, Math.round(body.length / TARGET_CHUNK_SIZE));
	const out: Chunk[] = [];
	let start = 0;

	for (let i = 1; i <= targetCount; i++) {
		if (i === targetCount) {
			const tail = body.slice(start);
			if (tail.trim()) {
				out.push(makeChunk(title, tail, i - 1, targetCount));
			}
			break;
		}

		const remaining = body.length - start;
		const remainingChunks = targetCount - i + 1;
		const dynamic = Math.floor(remaining / remainingChunks);
		const target = start + dynamic;
		const split = findBestSplit(body, target);

		out.push(makeChunk(title, body.slice(start, split), i - 1, targetCount));
		start = split;
	}

	return out;
}

function findBestSplit(content: string, targetPos: number): number {
	const searchStart = Math.max(0, targetPos - SEARCH_RANGE);
	const searchEnd = Math.min(content.length, targetPos + SEARCH_RANGE);
	const window = content.slice(searchStart, searchEnd);

	for (const [pattern, offset] of SPLIT_PATTERNS) {
		const pos = window.lastIndexOf(pattern);
		if (pos !== -1) return searchStart + pos + offset;
	}
	return targetPos;
}

function makeChunk(title: string | null, content: string, idx: number, total: number): Chunk {
	return {
		title: title?.trim() ? title : null,
		content: content.trim(),
		chunk_index: idx,
		total_chunks: total,
	};
}
