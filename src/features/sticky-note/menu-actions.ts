export type StickyNoteRichTextCommand =
	| "bold"
	| "italic"
	| "unordered"
	| "ordered"
	| "highlight"
	| "strikethrough"
	| "clear_format";

export type StickyNoteCardMenuCommand =
	| { type: "set_color"; colorHex: string }
	| { type: "toggle_pin" }
	| { type: "delete" };

export type StickyNoteCardMenuActionResult = "updated" | "deleted" | "noop";

export interface StickyNoteCardMenuTarget {
	colorHex?: string;
	isPinned: boolean;
	updatedAt: number;
}

export function applyStickyNoteCardMenuCommand(
	command: StickyNoteCardMenuCommand,
	target: StickyNoteCardMenuTarget,
): StickyNoteCardMenuActionResult {
	switch (command.type) {
		case "set_color":
			if (target.colorHex === command.colorHex) {
				return "noop";
			}
			target.colorHex = command.colorHex;
			target.updatedAt = Date.now();
			return "updated";
		case "toggle_pin":
			target.isPinned = !target.isPinned;
			target.updatedAt = Date.now();
			return "updated";
		case "delete":
			return "deleted";
		default:
			return "noop";
	}
}

export function applyStickyNoteRichTextCommand(command: StickyNoteRichTextCommand, editorEl: HTMLTextAreaElement): void {
	editorEl.focus();
	switch (command) {
		case "bold":
			toggleInlineToken(editorEl, "**");
			return;
		case "italic":
			toggleInlineToken(editorEl, "*");
			return;
		case "unordered":
			toggleListPrefix(editorEl, "unordered");
			return;
		case "ordered":
			toggleListPrefix(editorEl, "ordered");
			return;
		case "highlight":
			toggleInlineToken(editorEl, "==");
			return;
		case "strikethrough":
			toggleInlineToken(editorEl, "~~");
			return;
		case "clear_format":
			clearMarkdownFormatting(editorEl);
			return;
		default:
			return;
	}
}

function toggleInlineToken(editorEl: HTMLTextAreaElement, token: string): void {
	const value = editorEl.value;
	const start = editorEl.selectionStart ?? 0;
	const end = editorEl.selectionEnd ?? start;
	if (start > end) {
		applyTextareaEdit(editorEl, value, end, start);
		return;
	}
	if (start === end) {
		const wrapped = `${token}${token}`;
		const nextValue = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
		const caret = start + token.length;
		applyTextareaEdit(editorEl, nextValue, caret, caret);
		return;
	}

	const selected = value.slice(start, end);
	const hasTokenAtBothSides =
		start >= token.length &&
		end + token.length <= value.length &&
		value.slice(start - token.length, start) === token &&
		value.slice(end, end + token.length) === token;
	if (hasTokenAtBothSides) {
		const nextValue =
			`${value.slice(0, start - token.length)}${selected}${value.slice(end + token.length)}`;
		const nextStart = start - token.length;
		const nextEnd = nextStart + selected.length;
		applyTextareaEdit(editorEl, nextValue, nextStart, nextEnd);
		return;
	}

	const nextValue = `${value.slice(0, start)}${token}${selected}${token}${value.slice(end)}`;
	const nextStart = start + token.length;
	const nextEnd = nextStart + selected.length;
	applyTextareaEdit(editorEl, nextValue, nextStart, nextEnd);
}

function toggleListPrefix(editorEl: HTMLTextAreaElement, mode: "unordered" | "ordered"): void {
	const value = editorEl.value;
	const start = editorEl.selectionStart ?? 0;
	const end = editorEl.selectionEnd ?? start;
	const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const lineEndIndex = value.indexOf("\n", end);
	const lineEnd = lineEndIndex >= 0 ? lineEndIndex : value.length;
	const block = value.slice(lineStart, lineEnd);
	const lines = block.split("\n");

	const isOrderedLine = (line: string): boolean => /^(\s*)\d+\.\s+/.test(line);
	const isUnorderedLine = (line: string): boolean => /^(\s*)[-*+]\s+/.test(line);

	let nextLines: string[];
	if (mode === "unordered") {
		const allUnordered = lines.every((line) => line.trim().length === 0 || isUnorderedLine(line));
		nextLines = allUnordered
			? lines.map((line) => line.replace(/^(\s*)[-*+]\s+/, "$1"))
			: lines.map((line) => (line.trim().length === 0 ? line : line.replace(/^(\s*)/, "$1- ")));
	} else {
		const allOrdered = lines.every((line) => line.trim().length === 0 || isOrderedLine(line));
		nextLines = allOrdered
			? lines.map((line) => line.replace(/^(\s*)\d+\.\s+/, "$1"))
			: lines.map((line, index) => (
				line.trim().length === 0 ? line : line.replace(/^(\s*)/, `$1${index + 1}. `)
			));
	}

	const nextBlock = nextLines.join("\n");
	const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
	applyTextareaEdit(editorEl, nextValue, lineStart, lineStart + nextBlock.length);
}

function clearMarkdownFormatting(editorEl: HTMLTextAreaElement): void {
	const value = editorEl.value;
	const rawStart = editorEl.selectionStart ?? 0;
	const rawEnd = editorEl.selectionEnd ?? rawStart;
	const isCollapsed = rawStart === rawEnd;
	let start = isCollapsed ? value.lastIndexOf("\n", Math.max(0, rawStart - 1)) + 1 : rawStart;
	const lineEndIndex = value.indexOf("\n", rawEnd);
	let end = isCollapsed ? (lineEndIndex >= 0 ? lineEndIndex : value.length) : rawEnd;
	if (!isCollapsed) {
		const expanded = expandInlineWrappedSelection(value, start, end);
		start = expanded.start;
		end = expanded.end;
	}
	const selected = value.slice(start, end);

	let cleared = selected;
	let previous = "";
	while (cleared !== previous) {
		previous = cleared;
		cleared = cleared
			.replace(/(\*\*|__)([\s\S]*?)\1/g, "$2")
			.replace(/~~([\s\S]*?)~~/g, "$1")
			.replace(/==([\s\S]*?)==/g, "$1")
			.replace(/(\*|_)([\s\S]*?)\1/g, "$2");
	}
	cleared = cleared
		.replace(/^(\s*)#{1,6}\s+/gm, "$1")
		.replace(/^(\s*)>\s?/gm, "$1")
		.replace(/^(\s*)[-*+]\s+/gm, "$1")
		.replace(/^(\s*)\d+\.\s+/gm, "$1");

	const nextValue = `${value.slice(0, start)}${cleared}${value.slice(end)}`;
	const nextStart = start;
	const nextEnd = start + cleared.length;
	applyTextareaEdit(editorEl, nextValue, nextStart, nextEnd);
}

function expandInlineWrappedSelection(value: string, rawStart: number, rawEnd: number): { start: number; end: number } {
	const tokens = ["**", "~~", "==", "__", "*", "_"];
	let start = rawStart;
	let end = rawEnd;
	let changed = true;
	while (changed) {
		changed = false;
		for (const token of tokens) {
			const tokenLength = token.length;
			if (start < tokenLength || end + tokenLength > value.length) {
				continue;
			}
			if (value.slice(start - tokenLength, start) !== token) {
				continue;
			}
			if (value.slice(end, end + tokenLength) !== token) {
				continue;
			}
			start -= tokenLength;
			end += tokenLength;
			changed = true;
		}
	}
	return { start, end };
}

function applyTextareaEdit(
	editorEl: HTMLTextAreaElement,
	nextValue: string,
	selectionStart: number,
	selectionEnd: number,
): void {
	const scrollTop = editorEl.scrollTop;
	const scrollLeft = editorEl.scrollLeft;
	editorEl.value = nextValue;
	editorEl.setSelectionRange(selectionStart, selectionEnd);
	editorEl.scrollTop = scrollTop;
	editorEl.scrollLeft = scrollLeft;
}
