/**
 * Apple DocC JSON -> markdown converter.
 * Ported and trimmed from upstream apple-rag-mcp's ContentProcessor.
 */

// biome-ignore lint/suspicious/noExplicitAny: DocC JSON is dynamic; heavy narrowing would obscure shape.
type Node = any;

export interface ProcessedDocument {
	readonly title: string | null;
	readonly content: string;
	readonly extractedUrls: readonly string[];
}

const INTERNAL_DOMAIN = "https://developer.apple.com";

export function processDocument(data: Node): ProcessedDocument {
	const title = extractTitleBlock(data).trim() || null;
	const content = normalizeLineTerminators(extractMainContent(data));
	const extractedUrls = extractAllUrls(data);
	return { title, content, extractedUrls };
}

// ─── Title + abstract + platforms block ────────────────────────────────

function extractTitleBlock(data: Node): string {
	const parts: string[] = [];
	const meta = data?.metadata ?? {};

	if (meta.roleHeading && meta.title) parts.push(`${meta.roleHeading}: ${meta.title}`);
	else if (meta.title) parts.push(meta.title);
	else if (meta.roleHeading) parts.push(meta.roleHeading);

	if (Array.isArray(data?.abstract) && data.abstract.length > 0) {
		const text = data.abstract.map((x: Node) => x.text ?? "").join("");
		if (text.trim()) parts.push(`\n${text}`);
	}

	if (Array.isArray(meta.platforms) && meta.platforms.length > 0) {
		const platformInfo = meta.platforms
			.map((p: Node) => formatPlatform(p))
			.filter((s: string) => s.trim())
			.join(", ");
		if (platformInfo) parts.push(`\nPlatforms: ${platformInfo}`);

		const deprecation = new Set<string>();
		for (const p of meta.platforms as Node[]) {
			if ((p.deprecated || p.deprecatedAt) && p.message) deprecation.add(p.message);
		}
		if (deprecation.size > 0) {
			parts.push(`\nDeprecation Note: ${Array.from(deprecation).join("; ")}`);
		}
	}

	return `${parts.join("")}\n`;
}

function formatPlatform(p: Node): string {
	if (!p.name && p.deprecated) {
		return p.message ? `Deprecated (${p.message})` : "Deprecated";
	}
	if (!p.name) return "";

	let version = "";
	if (p.deprecatedAt && p.introducedAt) version = `${p.introducedAt}–${p.deprecatedAt} deprecated`;
	else if (p.introducedAt) version = `${p.introducedAt}+`;
	else if (p.deprecated) version = "deprecated";

	const beta = p.beta ? " [Beta]" : "";
	return `${p.name}${version ? ` ${version}` : ""}${beta}`;
}

// ─── Main content: walk primaryContentSections ─────────────────────────

function extractMainContent(data: Node): string {
	const sections: Node[] = data?.primaryContentSections ?? [];
	if (!sections.length) return "";

	const refs: Record<string, Node> = data?.references ?? {};
	const rendered = sections
		.map((s) => convertSection(s, refs, 0).content)
		.filter((c) => c.trim())
		.map((c) => c.trim());

	return rendered.join("\n\n");
}

function convertSection(
	section: Node,
	refs: Record<string, Node>,
	indent: number,
): { title: string; content: string } {
	const kind = section.type ?? section.kind;
	if (!kind) return { title: "", content: "" };

	const handlers: Record<string, () => { title: string; content: string }> = {
		heading: () => renderHeading(section),
		paragraph: () => ({ title: "", content: renderInlineArray(section.inlineContent ?? [], refs) }),
		row: () => renderRow(section, refs, indent),
		unorderedList: () => renderList(section, refs, indent, "unordered"),
		orderedList: () => renderList(section, refs, indent, "ordered"),
		codeListing: () => renderCodeListing(section),
		declarations: () => renderDeclarations(section),
		properties: () => renderProperties(section, refs),
		parameters: () => renderParameters(section, refs),
		aside: () => renderAside(section, refs, indent),
		termList: () => renderTermList(section, refs),
	};

	return handlers[kind]?.() ?? renderGeneric(section, refs, indent);
}

function renderHeading(section: Node): { title: string; content: string } {
	const level = Math.min(Math.max(section.level ?? 2, 1), 6);
	const prefix = "#".repeat(level);
	const title = section.text ?? "";
	return { title, content: `${prefix} ${title}` };
}

function renderInlineArray(items: readonly Node[], refs: Record<string, Node>): string {
	return items.map((inline) => renderInline(inline, refs)).join("");
}

function renderInline(inline: Node, refs: Record<string, Node>): string {
	switch (inline.type) {
		case "text":
			return normalizeLineTerminators(safeString(inline.text));
		case "reference":
			return renderReference(inline, refs);
		case "codeVoice":
			return inline.code ? `\`${normalizeLineTerminators(safeString(inline.code))}\`` : "";
		case "image":
			return renderMedia(inline, "Image");
		case "video":
			return renderMedia(inline, "Video");
		default:
			return "";
	}
}

function renderReference(inline: Node, refs: Record<string, Node>): string {
	const ref = inline.identifier ? refs[inline.identifier] : null;
	const text = ref
		? (ref.title ?? inline.text ?? inline.identifier)
		: (inline.text ?? inline.identifier ?? "");
	return text ? `\`${text}\`` : "";
}

function renderMedia(inline: Node, label: string): string {
	const abstract: Node[] = inline.metadata?.abstract ?? [];
	const text = abstract.map((x) => x.text ?? "").join("");
	return text ? `[${label}: ${text}]` : "";
}

function renderRow(
	section: Node,
	refs: Record<string, Node>,
	indent: number,
): { title: string; content: string } {
	let title = "";
	let content = "";
	for (const col of section.columns ?? []) {
		for (const item of col.content ?? []) {
			const r = convertSection(item, refs, indent);
			if (r.title) title += `${r.title}\n`;
			if (r.content) content += r.content;
		}
	}
	return { title, content };
}

function renderList(
	section: Node,
	refs: Record<string, Node>,
	indent: number,
	kind: "ordered" | "unordered",
): { title: string; content: string } {
	if (!section.items || indent > 10) return { title: "", content: "" };

	let out = "";
	section.items.forEach((item: Node, i: number) => {
		if (!item.content) return;
		const pad = "  ".repeat(indent);
		const marker = kind === "ordered" ? `${i + 1}. ` : "- ";
		out += `${pad}${marker}`;

		let first = true;
		(item.content as Node[]).forEach((entry, j) => {
			const r = convertSection(entry, refs, indent + 1);
			if (!r.content) return;

			if (isNestedList(entry)) {
				if (!first) out += "\n";
				out += r.content;
			} else {
				out += r.content.replace(/^#+\s*/, "").replace(/\n+$/, "");
				if (j < (item.content.length ?? 0) - 1) out += "\n";
			}
			first = false;
		});

		out += "\n";
	});

	if (indent === 0) out += "\n";
	return { title: "", content: out };
}

function isNestedList(n: Node): boolean {
	const k = n.type ?? n.kind;
	return k === "unorderedList" || k === "orderedList";
}

function renderCodeListing(section: Node): { title: string; content: string } {
	if (!Array.isArray(section.code) || section.code.length === 0) {
		return { title: "", content: "" };
	}
	const lang = section.syntax ?? "";
	return { title: "", content: `\`\`\`${lang}\n${section.code.join("\n")}\n\`\`\`` };
}

function renderDeclarations(section: Node): { title: string; content: string } {
	const decls: Array<{ platforms: string; code: string }> = [];

	for (const d of section.declarations ?? []) {
		const languages: string[] = d.languages ?? [];
		const platforms: string[] = d.platforms ?? [];
		const platformLabel = platforms.join(", ");

		const push = (tokens: Node[] | undefined) => {
			if (!tokens?.length) return;
			const code = formatDeclaration(tokens, languages);
			if (code.trim()) decls.push({ platforms: platformLabel, code });
		};

		push(d.tokens);
		for (const other of d.otherDeclarations?.declarations ?? []) push(other.tokens);
	}

	const content = decls
		.map((x) =>
			x.platforms ? `${x.platforms}\n\n\`\`\`\n${x.code}\n\`\`\`` : `\`\`\`\n${x.code}\n\`\`\``,
		)
		.join("\n\n");
	return { title: "", content };
}

function formatDeclaration(tokens: Node[], languages: string[]): string {
	const raw = tokens.map((t) => t.text ?? "").join("");
	if (!languages.includes("swift")) return raw;
	return formatSwiftFunction(raw);
}

function formatSwiftFunction(raw: string): string {
	const firstParen = raw.indexOf("(");
	if (firstParen === -1) return raw;

	const func = raw.slice(0, firstParen);
	const rest = raw.slice(firstParen + 1);
	const lastParen = rest.lastIndexOf(")");
	if (lastParen === -1) return raw;

	const params = splitTopLevel(rest.slice(0, lastParen), ",");
	const tail = rest.slice(lastParen);

	let out = `${func}(\n`;
	params.forEach((p, i) => {
		const trimmed = p.trim();
		if (!trimmed) return;
		out += `  ${trimmed}${i < params.length - 1 ? "," : ""}\n`;
	});
	out += `)${tail.slice(1)}`;
	return out;
}

function splitTopLevel(s: string, sep: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const c of s) {
		if (c === "(" || c === "[" || c === "<") depth++;
		else if (c === ")" || c === "]" || c === ">") depth--;
		if (c === sep && depth === 0) {
			out.push(cur);
			cur = "";
		} else {
			cur += c;
		}
	}
	if (cur) out.push(cur);
	return out;
}

function renderProperties(
	section: Node,
	refs: Record<string, Node>,
): { title: string; content: string } {
	let content = "";
	if (section.title) content += `### ${section.title}\n\n`;

	for (const item of section.items ?? []) {
		if (!item.name) continue;
		content += `${buildPropertyHeader(item)}\n\n`;
		for (const c of item.content ?? []) {
			const r = convertSection(c, refs, 0);
			if (r.content) content += r.content;
		}
		content += "\n";
	}
	return { title: "", content };
}

function buildPropertyHeader(item: Node): string {
	let h = `#### ${item.name}`;
	if (Array.isArray(item.type) && item.type.length > 0) {
		const typeText = item.type.map((t: Node) => t.text ?? "").join("");
		if (typeText) h += ` (${typeText})`;
	}
	const flags: string[] = [];
	if (item.required) flags.push("Required");
	if (item.deprecated) flags.push("Deprecated");
	if (flags.length) h += ` [${flags.join(", ")}]`;
	return h;
}

function renderParameters(
	section: Node,
	refs: Record<string, Node>,
): { title: string; content: string } {
	if (!Array.isArray(section.parameters) || section.parameters.length === 0) {
		return { title: "", content: "" };
	}

	let content = "## Parameters\n";
	for (const p of section.parameters) {
		if (!p.name) continue;
		content += `### ${p.name}\n`;
		for (const c of p.content ?? []) {
			const r = convertSection(c, refs, 0);
			if (r.content) content += `${r.content}\n`;
		}
	}
	return { title: "", content };
}

function renderAside(
	section: Node,
	refs: Record<string, Node>,
	indent: number,
): { title: string; content: string } {
	const label: string =
		section.name ??
		(section.style ? section.style.charAt(0).toUpperCase() + section.style.slice(1) : "");

	let content = "";
	(section.content ?? []).forEach((item: Node, i: number) => {
		const r = convertSection(item, refs, indent);
		if (!r.content) return;
		content += i === 0 && label ? `**${label}**: ${r.content}\n` : `${r.content}\n`;
	});
	return { title: "", content };
}

function renderTermList(
	section: Node,
	refs: Record<string, Node>,
): { title: string; content: string } {
	let content = "";
	for (const item of section.items ?? []) {
		if (item.term?.inlineContent) {
			content += `**${renderInlineArray(item.term.inlineContent, refs)}**\n`;
		}
		for (const def of item.definition?.content ?? []) {
			const r = convertSection(def, refs, 0);
			if (r.content) content += `${r.content}\n`;
		}
	}
	return { title: "", content };
}

function renderGeneric(
	section: Node,
	refs: Record<string, Node>,
	indent: number,
): { title: string; content: string } {
	let title = "";
	let content = "";
	for (const item of section.content ?? []) {
		const r = convertSection(item, refs, indent);
		if (r.title) title += `${r.title}\n`;
		if (r.content) content += `${r.content}\n`;
	}
	return { title, content };
}

// ─── URL extraction ────────────────────────────────────────────────────

function extractAllUrls(data: Node): string[] {
	const urls = new Set<string>();
	for (const ref of Object.values(data?.references ?? {}) as Node[]) {
		if (typeof ref?.url === "string" && ref.url.startsWith("/")) {
			urls.add(`${INTERNAL_DOMAIN}${ref.url.replace(/\/$/, "")}`);
		} else if (typeof ref?.url === "string" && ref.url.startsWith(INTERNAL_DOMAIN)) {
			urls.add(ref.url.replace(/\/$/, ""));
		}
	}
	return [...urls];
}

// ─── Utilities ─────────────────────────────────────────────────────────

function safeString(v: unknown): string {
	return typeof v === "string" ? v : String(v ?? "");
}

function normalizeLineTerminators(s: string): string {
	return s.replace(/[\u2028\u2029]/g, "\n");
}
