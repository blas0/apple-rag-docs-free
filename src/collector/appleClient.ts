/**
 * Apple Developer Documentation + WWDC Videos fetcher.
 *
 * Note: these APIs are not officially public. Apple may change or block them
 * at any time. Respect developer.apple.com's robots.txt and keep request
 * volumes polite.
 */

const DEFAULT_HEADERS: Record<string, string> = {
	Accept: "application/json",
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
	"Accept-Language": "en-US,en;q=0.9",
	"Cache-Control": "no-cache",
};

const API_ENDPOINTS = {
	docc: "https://www.swift.org/data/documentation",
	default: "https://developer.apple.com/tutorials/data",
};

const ALL_VIDEOS_URL = "https://developer.apple.com/videos/all-videos/";
const VIDEO_URL_PREFIX = "https://developer.apple.com/videos/play/";
const PERMANENT_ERROR_CODES = new Set([403, 404, 410]);

export interface DocumentContent {
	readonly title: string | null;
	readonly content: string;
	readonly extractedUrls: readonly string[];
}

export interface VideoContent {
	readonly title: string | null;
	readonly content: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Apple DocC JSON is dynamic and deeply nested by design.
export type AppleJson = any;

export interface FetchResult<T> {
	readonly url: string;
	readonly data?: T;
	readonly error?: string;
	readonly permanent?: boolean;
}

export function isVideoUrl(url: string): boolean {
	return url.startsWith(VIDEO_URL_PREFIX);
}

export async function discoverVideoUrls(): Promise<string[]> {
	const res = await fetch(ALL_VIDEOS_URL, {
		headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
	});
	if (!res.ok) throw new Error(`all-videos HTTP ${res.status}`);

	const html = await res.text();
	const matches = html.matchAll(/href="(\/videos\/play\/[^"]+)"/g);
	const urls = [...matches].map(
		(m) => `https://developer.apple.com${(m[1] ?? "").replace(/\/$/, "")}`,
	);
	return [...new Set(urls)];
}

export async function fetchVideo(url: string): Promise<FetchResult<VideoContent>> {
	try {
		const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, Accept: "text/html" } });

		if (PERMANENT_ERROR_CODES.has(res.status)) {
			return { url, error: `HTTP ${res.status}`, permanent: true };
		}
		if (!res.ok) return { url, error: `HTTP ${res.status}` };

		const html = await res.text();
		const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
		const title = titleMatch?.[1] ?? null;

		const transcriptMatch = html.match(/<section id="transcript-content">([\s\S]*?)<\/section>/);
		if (!transcriptMatch) return { url, error: "NO_TRANSCRIPT", permanent: true };

		const segments = [...(transcriptMatch[1]?.matchAll(/data-start="[0-9.]+"[^>]*>([^<]*)/g) ?? [])]
			.map((m) => (m[1] ?? "").trim())
			.filter(Boolean);

		if (segments.length === 0) return { url, error: "EMPTY_TRANSCRIPT", permanent: true };

		return { url, data: { title, content: segments.join(" ") } };
	} catch (e) {
		return { url, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function fetchDocumentJson(url: string): Promise<FetchResult<AppleJson>> {
	try {
		const apiUrl = convertToJsonApi(url);
		const res = await fetch(apiUrl, { headers: DEFAULT_HEADERS });

		if (PERMANENT_ERROR_CODES.has(res.status)) {
			return { url, error: `HTTP ${res.status}`, permanent: true };
		}
		if (!res.ok) return { url, error: `HTTP ${res.status}` };

		const data = (await res.json()) as AppleJson;
		const check = validateDocument(data);
		if (!check.ok) return { url, error: check.error, permanent: check.permanent };

		return { url, data };
	} catch (e) {
		return { url, error: e instanceof Error ? e.message : String(e) };
	}
}

function convertToJsonApi(url: string): string {
	const u = new URL(url);
	const path = u.pathname.replace(/\/$/, "");

	// Special-case Apple doc path that maps to swift.org docc.
	if (
		url === "https://developer.apple.com/documentation/xcode/formatting-your-documentation-content"
	) {
		const doccPath = path.replace(/^\/documentation\/xcode/, "/docc");
		return `${API_ENDPOINTS.docc}${doccPath}.json`;
	}

	const endpoint = url.includes("/documentation/docc") ? API_ENDPOINTS.docc : API_ENDPOINTS.default;
	return `${endpoint}${path}.json`;
}

interface Check {
	readonly ok: boolean;
	readonly error?: string;
	readonly permanent?: boolean;
}

function validateDocument(data: unknown): Check {
	if (!data || typeof data !== "object") return { ok: false, error: "not an object" };
	const rec = data as Record<string, unknown>;

	if (!rec.primaryContentSections) {
		return { ok: false, error: "NO_PRIMARY_CONTENT", permanent: true };
	}
	if (!rec.metadata) return { ok: false, error: "NO_METADATA" };

	const sections = rec.primaryContentSections;
	if (!Array.isArray(sections) || sections.length === 0) {
		return { ok: false, error: "NO_SUBSTANTIAL_CONTENT", permanent: true };
	}

	const substantial = sections.some((section: Record<string, unknown>) => {
		const kind = (section.kind ?? section.type) as string | undefined;
		if (kind === "mentions") return false;
		if (kind === "content" && Array.isArray(section.content)) {
			return (section.content as Array<Record<string, unknown>>).some(
				(item) => item.type !== "links",
			);
		}
		return true;
	});

	if (!substantial) {
		return { ok: false, error: "NO_SUBSTANTIAL_CONTENT", permanent: true };
	}

	return { ok: true };
}
