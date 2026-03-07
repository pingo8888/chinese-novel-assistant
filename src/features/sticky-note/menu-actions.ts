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

const INLINE_FORMAT_SELECTOR = "strong, b, em, i, u, s, del, code, span, a";

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

export function applyStickyNoteRichTextCommand(command: StickyNoteRichTextCommand, editorEl: HTMLElement): void {
	editorEl.focus();
	switch (command) {
		case "bold":
			void document.execCommand("bold");
			return;
		case "italic":
			void document.execCommand("italic");
			return;
		case "unordered":
			void document.execCommand("insertUnorderedList");
			return;
		case "ordered":
			void document.execCommand("insertOrderedList");
			return;
		case "highlight":
			applySelectionHighlight(editorEl);
			return;
		case "strikethrough":
			void document.execCommand("strikeThrough");
			return;
		case "clear_format":
			applyClearFormat(editorEl);
			return;
		default:
			return;
	}
}

function applyClearFormat(editorEl: HTMLElement): void {
	const selection = resolveSelectionInside(editorEl, true);
	if (!selection || selection.rangeCount === 0) {
		return;
	}
	const range = selection.getRangeAt(0).cloneRange();
	const isCollapsed = selection.isCollapsed;

	// Inline formatting first.
	void document.execCommand("removeFormat");
	void document.execCommand("unlink");

	// Clear custom highlight tags created by the highlighter action.
	const selectedMarks = isCollapsed
		? collectAncestorElements(range.startContainer, editorEl, "mark")
		: collectIntersectingElements(editorEl, "mark", range);
	for (const markEl of sortByDepthDesc(uniqueElements(selectedMarks))) {
		unwrapElementKeepChildren(markEl);
	}

	// `removeFormat` is inconsistent on semantic inline tags in contentEditable; unwrap them explicitly.
	const selectedInlineFormats = isCollapsed
		? collectAncestorElements(range.startContainer, editorEl, INLINE_FORMAT_SELECTOR)
		: collectIntersectingElements(editorEl, INLINE_FORMAT_SELECTOR, range);
	for (const inlineEl of sortByDepthDesc(uniqueElements(selectedInlineFormats))) {
		unwrapElementKeepChildren(inlineEl);
	}

	// `removeFormat` won't remove list structure; unwrap selected lists into paragraphs.
	const selectedLists = isCollapsed
		? collectAncestorLists(range.startContainer, editorEl)
		: collectIntersectingLists(editorEl, range);
	for (const listEl of selectedLists) {
		unwrapListElement(listEl);
	}

}

function applySelectionHighlight(editorEl: HTMLElement): void {
	const selection = resolveSelectionInside(editorEl);
	if (!selection || selection.rangeCount === 0) {
		return;
	}
	const range = selection.getRangeAt(0);
	if (range.collapsed) {
		return;
	}
	const fragment = range.extractContents();
	const markEl = document.createElement("mark");
	markEl.appendChild(fragment);
	range.insertNode(markEl);
	const nextRange = document.createRange();
	nextRange.selectNodeContents(markEl);
	selection.removeAllRanges();
	selection.addRange(nextRange);
}

function resolveSelectionInside(containerEl: HTMLElement, allowCollapsed = false): Selection | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return null;
	}
	if (!allowCollapsed && selection.isCollapsed) {
		return null;
	}
	const anchorNode = selection.anchorNode;
	const focusNode = selection.focusNode;
	if (!anchorNode || !focusNode) {
		return null;
	}
	if (!containerEl.contains(anchorNode) || !containerEl.contains(focusNode)) {
		return null;
	}
	return selection;
}

function collectIntersectingLists(editorEl: HTMLElement, range: Range): HTMLElement[] {
	const lists = Array.from(editorEl.querySelectorAll<HTMLElement>("ul, ol"));
	return lists.filter((listEl) => intersectsRange(range, listEl));
}

function collectIntersectingElements(editorEl: HTMLElement, selector: string, range: Range): HTMLElement[] {
	const elements = Array.from(editorEl.querySelectorAll<HTMLElement>(selector));
	return elements.filter((el) => intersectsRange(range, el));
}

function collectAncestorElements(startNode: Node, rootEl: HTMLElement, selector: string): HTMLElement[] {
	const matched: HTMLElement[] = [];
	let current: Node | null = startNode;
	while (current && current !== rootEl) {
		if (current instanceof HTMLElement && current.matches(selector)) {
			matched.push(current);
		}
		current = current.parentNode;
	}
	return matched;
}

function collectAncestorLists(startNode: Node, rootEl: HTMLElement): HTMLElement[] {
	return collectAncestorElements(startNode, rootEl, "ul, ol");
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
	return Array.from(new Set(elements));
}

function sortByDepthDesc(elements: HTMLElement[]): HTMLElement[] {
	return [...elements].sort((left, right) => resolveDepth(right) - resolveDepth(left));
}

function resolveDepth(element: HTMLElement): number {
	let depth = 0;
	let current: HTMLElement | null = element;
	while (current) {
		depth += 1;
		current = current.parentElement;
	}
	return depth;
}

function intersectsRange(range: Range, node: Node): boolean {
	try {
		return range.intersectsNode(node);
	} catch (_error) {
		return false;
	}
}

function unwrapElementKeepChildren(element: HTMLElement): void {
	const parent = element.parentNode;
	if (!parent) {
		return;
	}
	const fragment = document.createDocumentFragment();
	while (element.firstChild) {
		fragment.appendChild(element.firstChild);
	}
	parent.replaceChild(fragment, element);
}

function unwrapListElement(listEl: HTMLElement): void {
	const parent = listEl.parentNode;
	if (!parent) {
		return;
	}

	const fragment = document.createDocumentFragment();
	const children = Array.from(listEl.children);
	for (const child of children) {
		if (!(child instanceof HTMLLIElement)) {
			fragment.appendChild(child);
			continue;
		}
		const paragraphEl = document.createElement("p");
		while (child.firstChild) {
			paragraphEl.appendChild(child.firstChild);
		}
		if (paragraphEl.textContent?.trim() || paragraphEl.children.length > 0) {
			fragment.appendChild(paragraphEl);
		}
	}

	parent.replaceChild(fragment, listEl);
}
