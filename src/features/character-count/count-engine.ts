const FRONTMATTER_BLOCK_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const HEADING_PREFIX_REGEX = /^[ \t]{0,3}#{1,6}[ \t]*/gm;
const BLOCKQUOTE_PREFIX_REGEX = /^[ \t]*>[ \t]+/gm;
const EMPTY_TASK_PREFIX_REGEX = /^[ \t]*-[ \t]+\[[ \t]\][ \t]*/gm;
const ORDERED_LIST_PREFIX_REGEX = /^[ \t]*[+-]?\d+\.[ \t]+/gm;
// ASCII letters/digits/punctuation run (excluding '-' to respect the "hyphen doesn't count" rule)
const ASCII_RUN_REGEX = /[A-Za-z0-9\x21-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]+/g;
const WHITESPACE_AND_HYPHEN_REGEX = /[\s-]+/g;
const EXCALIDRAW_FRONTMATTER_KEY_REGEX = /^\s*excalidraw-plugin\s*:/m;
const COUNT_TOKEN = "¤";

interface FrontmatterExtractionResult {
	body: string;
	frontmatter: string | null;
}

function extractFrontmatter(content: string): FrontmatterExtractionResult {
	const normalized = content.replace(/^\uFEFF/, "");
	const match = normalized.match(FRONTMATTER_BLOCK_REGEX);
	if (!match) {
		return {
			body: normalized,
			frontmatter: null,
		};
	}

	return {
		body: normalized.slice(match[0].length),
		frontmatter: match[1] ?? "",
	};
}

export function hasExcalidrawFrontmatter(content: string): boolean {
	const extracted = extractFrontmatter(content);
	if (!extracted.frontmatter) {
		return false;
	}
	return EXCALIDRAW_FRONTMATTER_KEY_REGEX.test(extracted.frontmatter);
}

export function countMarkdownCharacters(content: string): number {
	if (!content) {
		return 0;
	}

	const extracted = extractFrontmatter(content);
	const withoutBlockquoteMarkers = extracted.body.replace(BLOCKQUOTE_PREFIX_REGEX, "");
	const withoutTaskPrefixes = withoutBlockquoteMarkers.replace(EMPTY_TASK_PREFIX_REGEX, "");
	const withoutHeadingMarkers = withoutTaskPrefixes.replace(HEADING_PREFIX_REGEX, "");
	const orderedListCollapsed = withoutHeadingMarkers.replace(ORDERED_LIST_PREFIX_REGEX, COUNT_TOKEN);
	const asciiRunsCollapsed = orderedListCollapsed.replace(ASCII_RUN_REGEX, COUNT_TOKEN);
	const compacted = asciiRunsCollapsed.replace(WHITESPACE_AND_HYPHEN_REGEX, "");
	return Array.from(compacted).length;
}
