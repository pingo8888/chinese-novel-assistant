import { Notice, setIcon, type App, type TFile } from "obsidian";
import { UI } from "../../../constants";
import type { TranslationKey } from "../../../lang";
import type { StickyNoteCardModel, StickyNoteSortMode, StickyNoteViewOptions } from "./types";
import { showStickyNoteContentMenu } from "./content-menu";
import { applyStickyNoteCardMenuCommand, applyStickyNoteRichTextCommand } from "../../../features/sticky-note/menu-actions";
import { promptVaultImageFile } from "../../modals/vault-image-picker-modal";
import { showStickyNoteCardMenu } from "./card-menu";

interface StickyNoteCardItemDeps {
	app: App;
	containerEl: HTMLElement;
	card: StickyNoteCardModel;
	sortMode: StickyNoteSortMode;
	viewOptions: StickyNoteViewOptions;
	t: (key: TranslationKey) => string;
	onCardTouched: () => void;
	onCardDelete: () => void;
}

const MIN_CONTENT_ROWS = 1;
const BLOCK_TAGS = new Set(["P", "DIV", "UL", "OL", "LI", "BLOCKQUOTE", "PRE"]);
const ALLOWED_TAGS = new Set([
	"P",
	"BR",
	"STRONG",
	"B",
	"EM",
	"I",
	"U",
	"S",
	"DEL",
	"A",
	"UL",
	"OL",
	"LI",
	"SPAN",
	"CODE",
	"BLOCKQUOTE",
	"MARK",
]);

export function renderStickyNoteCardItem(deps: StickyNoteCardItemDeps): void {
	const { card } = deps;
	const rootEl = deps.containerEl.createDiv({ cls: "cna-sticky-note-card" });
	applyCardTone(rootEl, card.colorHex);
	rootEl.style.setProperty("--cna-sticky-note-content-rows", `${resolveContentRows(deps.viewOptions.defaultRows)}`);

	const headerEl = rootEl.createDiv({ cls: "cna-sticky-note-card__header" });
	const timeEl = headerEl.createDiv({ cls: "cna-sticky-note-card__time" });
	const timeTextEl = timeEl.createSpan({ cls: "cna-sticky-note-card__time-text" });
	const timePinEl = timeEl.createSpan({
		cls: "cna-sticky-note-card__time-pin is-hidden",
	});
	setIcon(timePinEl, UI.icon.pin);
	const actionsEl = headerEl.createDiv({ cls: "cna-sticky-note-card__actions" });

	const pinButtonEl = actionsEl.createEl("button", {
		cls: "cna-sticky-note-card__action-button",
		attr: {
			type: "button",
			"aria-label": deps.t("feature.right_sidebar.sticky_note.card.action.pin.tooltip"),
		},
	});
	setIcon(pinButtonEl, UI.icon.send);

	const menuButtonEl = actionsEl.createEl("button", {
		cls: "cna-sticky-note-card__action-button",
		attr: {
			type: "button",
			"aria-label": deps.t("feature.right_sidebar.sticky_note.card.action.menu.tooltip"),
		},
	});
	setIcon(menuButtonEl, UI.icon.ellipsis);

	const contentSectionEl = rootEl.createDiv({ cls: "cna-sticky-note-card__content-section" });
	const contentDisplayEl = contentSectionEl.createDiv({
		cls: "cna-sticky-note-card__surface cna-sticky-note-card__surface-display markdown-rendered",
	});
	const contentEditorEl = contentSectionEl.createDiv({
		cls: "cna-sticky-note-card__surface cna-sticky-note-card__surface-editor cna-sticky-note-card__surface-editor-rich markdown-rendered",
		attr: {
			contenteditable: "true",
		},
	});

	const tagsBarEl = rootEl.createDiv({ cls: "cna-sticky-note-card__tags-bar" });
	const tagsMainEl = tagsBarEl.createDiv({ cls: "cna-sticky-note-card__tags-main" });
	const tagsEditorEl = tagsMainEl.createDiv({
		cls: "cna-sticky-note-card__surface cna-sticky-note-card__surface-editor cna-sticky-note-card__tags-editor",
		attr: {
			contenteditable: "true",
			"aria-label": deps.t("feature.right_sidebar.sticky_note.card.tags.editor.aria_label"),
		},
	});
	const imageToggleButtonEl = tagsBarEl.createEl("button", {
		cls: "cna-sticky-note-card__image-toggle",
		attr: {
			type: "button",
		},
	});

	const imageSectionEl = rootEl.createDiv({ cls: "cna-sticky-note-card__images" });
	const imageGridEl = imageSectionEl.createDiv({ cls: "cna-sticky-note-card__image-grid" });

	let isEditingContent = false;
	let isEditingTags = false;

	const renderHeader = (): void => {
		timeTextEl.setText(formatDateTime(resolveHeaderTimestamp(card, deps.sortMode)));
		timePinEl.style.display = card.isPinned ? "inline-flex" : "none";
		timePinEl.setAttr("aria-label", deps.t("feature.right_sidebar.sticky_note.card.menu.pin"));
	};

	const renderContentDisplay = (): void => {
		contentDisplayEl.empty();
		if (card.contentPlainText.trim().length === 0) {
			contentDisplayEl.createDiv({
				cls: "cna-sticky-note-card__placeholder-text",
				text: deps.t("feature.right_sidebar.sticky_note.card.content.placeholder"),
			});
			return;
		}
		contentDisplayEl.innerHTML = card.contentHtml;
	};

	const renderTagsDisplay = (): void => {
		tagsEditorEl.empty();
		tagsEditorEl.toggleClass("is-editing", isEditingTags);
		if (isEditingTags) {
			tagsEditorEl.setText(card.tagsText);
			return;
		}
		const tags = parseTags(card.tagsText);
		if (tags.length === 0) {
			if (deps.viewOptions.tagHintTextEnabled) {
				tagsEditorEl.createSpan({
					cls: "cna-sticky-note-card__tags-placeholder",
					text: deps.t("feature.right_sidebar.sticky_note.card.tags.placeholder"),
				});
			}
			return;
		}
		for (const tag of tags) {
			tagsEditorEl.createSpan({
				cls: "cna-sticky-note-card__tag",
				text: tag,
			});
		}
	};

	const setContentEditing = (editing: boolean, evt?: MouseEvent): void => {
		isEditingContent = editing;
		contentDisplayEl.toggleClass("is-hidden", editing);
		contentEditorEl.toggleClass("is-hidden", !editing);
		if (!editing) {
			return;
		}
		contentEditorEl.innerHTML = card.contentHtml;
		contentEditorEl.focus();
		if (evt) {
			placeCaretByPointer(contentEditorEl, evt.clientX, evt.clientY);
		} else {
			placeCaretAtEnd(contentEditorEl);
		}
	};

	const setTagsEditing = (editing: boolean): void => {
		if (isEditingTags === editing) {
			return;
		}
		isEditingTags = editing;
		renderTagsDisplay();
		if (editing) {
			tagsEditorEl.focus();
			placeCaretAtEnd(tagsEditorEl);
		}
	};

	const renderImageToggle = (): void => {
		imageToggleButtonEl.empty();
		setIcon(imageToggleButtonEl, card.isImageExpanded ? UI.icon.chevronUp : UI.icon.chevronDown);
		imageToggleButtonEl.setAttr(
			"aria-label",
			card.isImageExpanded
				? deps.t("feature.right_sidebar.sticky_note.card.image.toggle.collapse")
				: deps.t("feature.right_sidebar.sticky_note.card.image.toggle.expand"),
		);
	};

	const renderImages = (): void => {
		imageSectionEl.toggleClass("is-collapsed", !card.isImageExpanded);
		imageGridEl.empty();

		for (const image of card.images) {
			const imageCardEl = imageGridEl.createDiv({ cls: "cna-sticky-note-card__image-card" });
			const imageEl = imageCardEl.createEl("img", {
				cls: "cna-sticky-note-card__image",
				attr: {
					src: image.src,
					alt: image.name,
				},
			});
			imageEl.draggable = false;
			const removeButtonEl = imageCardEl.createEl("button", {
				cls: "cna-sticky-note-card__image-remove",
				attr: {
					type: "button",
					"aria-label": deps.t("feature.right_sidebar.sticky_note.card.image.remove.tooltip"),
				},
			});
			setIcon(removeButtonEl, "x");
			removeButtonEl.addEventListener("click", () => {
				const nextImages = card.images.filter((item) => item.id !== image.id);
				if (nextImages.length === card.images.length) {
					return;
				}
				if (image.revokeOnDestroy) {
					URL.revokeObjectURL(image.src);
				}
				card.images = nextImages;
				card.updatedAt = Date.now();
				renderHeader();
				renderImages();
				deps.onCardTouched();
			});
		}

		const addButtonEl = imageGridEl.createEl("button", {
			cls: "cna-sticky-note-card__image-add",
			attr: {
				type: "button",
				"aria-label": deps.t("feature.right_sidebar.sticky_note.card.image.add.tooltip"),
			},
		});
		setIcon(addButtonEl, "plus");
		addButtonEl.addEventListener("click", () => {
			void addImageFromVault();
		});
	};

	const addImageFromVault = async (): Promise<void> => {
		const imageFile = await promptVaultImageFile(deps.app, (key) => deps.t(key));
		if (!imageFile) {
			return;
		}
		if (card.images.some((image) => image.vaultPath === imageFile.path)) {
			new Notice(deps.t("feature.right_sidebar.sticky_note.card.image.add.duplicate"));
			return;
		}
		const preview = await resolveVaultImagePreview(deps.app, imageFile);
		card.images = [
			...card.images,
			{
				id: `${card.id}-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
				src: preview.src,
				name: imageFile.name,
				revokeOnDestroy: preview.revokeOnDestroy,
				vaultPath: imageFile.path,
			},
		];
		card.updatedAt = Date.now();
		card.isImageExpanded = true;
		renderHeader();
		renderImageToggle();
		renderImages();
		deps.onCardTouched();
	};

	const commitContentEditorValue = (): void => {
		const nextHtml = sanitizeRichHtml(contentEditorEl.innerHTML);
		const nextPlainText = extractPlainText(nextHtml);
		const changed = nextHtml !== card.contentHtml;
		card.contentHtml = nextHtml;
		card.contentPlainText = nextPlainText;
		renderContentDisplay();
		setContentEditing(false);
		if (changed) {
			card.updatedAt = Date.now();
			renderHeader();
			deps.onCardTouched();
		}
	};

	const commitTagsEditorValue = (): void => {
		const nextValue = normalizeTagsText(tagsEditorEl.textContent ?? "");
		const changed = nextValue !== card.tagsText;
		card.tagsText = nextValue;
		setTagsEditing(false);
		if (changed) {
			card.updatedAt = Date.now();
			renderHeader();
			deps.onCardTouched();
		}
	};

	setContentEditing(false);
	isEditingTags = false;
	renderHeader();
	renderContentDisplay();
	renderTagsDisplay();
	renderImageToggle();
	renderImages();

	contentDisplayEl.addEventListener("click", (evt) => {
		setContentEditing(true, evt);
	});

	contentEditorEl.addEventListener("keydown", (evt) => {
		if (evt.key === "Escape") {
			contentEditorEl.innerHTML = card.contentHtml;
			commitContentEditorValue();
		}
	});
	contentEditorEl.addEventListener("contextmenu", (evt) => {
		if (!isEditingContent) {
			return;
		}
		showStickyNoteContentMenu({
			event: evt,
			editorEl: contentEditorEl,
			t: (key) => deps.t(key),
			onCommand: (command) => {
				applyStickyNoteRichTextCommand(command, contentEditorEl);
			},
		});
	});
	contentEditorEl.addEventListener("blur", () => {
		commitContentEditorValue();
	});

	tagsEditorEl.addEventListener("focus", () => {
		setTagsEditing(true);
	});
	tagsEditorEl.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter") {
			evt.preventDefault();
			tagsEditorEl.blur();
			return;
		}
		if (evt.key === "Escape") {
			evt.preventDefault();
			renderTagsDisplay();
			tagsEditorEl.blur();
		}
	});
	tagsEditorEl.addEventListener("paste", (evt) => {
		if (!isEditingTags) {
			return;
		}
		evt.preventDefault();
		const text = evt.clipboardData?.getData("text/plain") ?? "";
		void document.execCommand("insertText", false, text);
	});
	tagsEditorEl.addEventListener("blur", () => {
		commitTagsEditorValue();
	});

	imageToggleButtonEl.addEventListener("click", () => {
		card.isImageExpanded = !card.isImageExpanded;
		renderImageToggle();
		renderImages();
	});

	menuButtonEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		showStickyNoteCardMenu({
			anchorEl: menuButtonEl,
			t: (key) => deps.t(key),
			activeColorHex: card.colorHex,
			isPinned: card.isPinned,
			onCommand: (command) => {
				const result = applyStickyNoteCardMenuCommand(command, card);
				if (result === "deleted") {
					deps.onCardDelete();
					return;
				}
				if (result === "updated") {
					applyCardTone(rootEl, card.colorHex);
					deps.onCardTouched();
				}
			},
		});
	});
}

function resolveHeaderTimestamp(card: StickyNoteCardModel, sortMode: StickyNoteSortMode): number {
	switch (sortMode) {
		case "created_desc":
		case "created_asc":
			return card.createdAt;
		case "modified_desc":
		case "modified_asc":
			return card.updatedAt;
		default:
			return card.createdAt;
	}
}

function resolveContentRows(defaultRows: number): number {
	return Math.max(MIN_CONTENT_ROWS, Math.round(defaultRows));
}

function applyCardTone(rootEl: HTMLElement, colorHex?: string): void {
	if (!colorHex) {
		rootEl.removeClass("has-custom-color");
		rootEl.style.removeProperty("--cna-sticky-note-card-accent");
		rootEl.style.removeProperty("--cna-sticky-note-card-accent-alpha");
		return;
	}
	rootEl.addClass("has-custom-color");
	rootEl.style.setProperty("--cna-sticky-note-card-accent", colorHex);
	rootEl.style.setProperty("--cna-sticky-note-card-accent-alpha", hexToRgba(colorHex, 0.25));
}

function formatDateTime(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`;
}

function padNumber(value: number): string {
	return `${value}`.padStart(2, "0");
}

function parseTags(source: string): string[] {
	const matches = source.match(/#[^\s#]+/g);
	return matches ? matches : [];
}

function normalizeTagsText(source: string): string {
	const tags = parseTags(source);
	return tags.join(" ");
}

async function resolveVaultImagePreview(app: App, file: TFile): Promise<{ src: string; revokeOnDestroy: boolean }> {
	try {
		const binary = await app.vault.readBinary(file);
		const blob = new Blob([binary], {
			type: resolveImageMimeType(file.extension),
		});
		return {
			src: URL.createObjectURL(blob),
			revokeOnDestroy: true,
		};
	} catch (_error) {
		return {
			src: app.vault.getResourcePath(file),
			revokeOnDestroy: false,
		};
	}
}

function resolveImageMimeType(extension: string): string {
	switch (extension.toLowerCase()) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "bmp":
			return "image/bmp";
		case "svg":
			return "image/svg+xml";
		case "avif":
			return "image/avif";
		case "heic":
			return "image/heic";
		case "heif":
			return "image/heif";
		case "tiff":
		case "tif":
			return "image/tiff";
		default:
			return "application/octet-stream";
	}
}

function hexToRgba(hex: string, alpha: number): string {
	const normalized = hex.trim().replace("#", "");
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		return hex;
	}
	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	const clampedAlpha = Math.max(0, Math.min(1, alpha));
	return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}

function placeCaretByPointer(targetEl: HTMLElement, clientX: number, clientY: number): void {
	const selection = window.getSelection();
	if (!selection) {
		return;
	}

	let range: Range | null = null;
	const docWithCaret = document as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	if (typeof docWithCaret.caretPositionFromPoint === "function") {
		const pos = docWithCaret.caretPositionFromPoint(clientX, clientY);
		if (pos) {
			range = document.createRange();
			range.setStart(pos.offsetNode, pos.offset);
			range.collapse(true);
		}
	} else if (typeof docWithCaret.caretRangeFromPoint === "function") {
		range = docWithCaret.caretRangeFromPoint(clientX, clientY);
	}

	if (!range || !targetEl.contains(range.startContainer)) {
		placeCaretAtEnd(targetEl);
		return;
	}

	selection.removeAllRanges();
	selection.addRange(range);
}

function placeCaretAtEnd(targetEl: HTMLElement): void {
	const selection = window.getSelection();
	if (!selection) {
		return;
	}
	const range = document.createRange();
	range.selectNodeContents(targetEl);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

function sanitizeRichHtml(sourceHtml: string): string {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = sourceHtml;

	const walk = (node: Node): void => {
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return;
		}
		const element = node as HTMLElement;
		const tagName = element.tagName.toUpperCase();
		if (!ALLOWED_TAGS.has(tagName)) {
			const parent = element.parentNode;
			if (!parent) {
				return;
			}
			const fragment = document.createDocumentFragment();
			while (element.firstChild) {
				fragment.appendChild(element.firstChild);
			}
			parent.replaceChild(fragment, element);
			return;
		}

		const attrs = Array.from(element.attributes);
		for (const attr of attrs) {
			const attrName = attr.name.toLowerCase();
			if (attrName.startsWith("on")) {
				element.removeAttribute(attr.name);
				continue;
			}
			if (tagName === "A") {
				const href = element.getAttribute("href");
				if (href && !/^(https?:|obsidian:|\/|#)/i.test(href)) {
					element.removeAttribute("href");
				}
				if (attrName !== "href" && attrName !== "title") {
					element.removeAttribute(attr.name);
				}
				continue;
			}
			if (attrName === "style" || attrName === "class" || attrName === "id" || attrName.startsWith("data-")) {
				element.removeAttribute(attr.name);
				continue;
			}
			if (attrName !== "href" && attrName !== "title") {
				element.removeAttribute(attr.name);
			}
		}
	};

	const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_ELEMENT);
	const nodes: Node[] = [];
	let current = walker.nextNode();
	while (current) {
		nodes.push(current);
		current = walker.nextNode();
	}
	for (const node of nodes) {
		walk(node);
	}

	const normalized = normalizeRichHtml(wrapper);
	return normalized.length > 0 ? normalized : "";
}

function normalizeRichHtml(wrapper: HTMLElement): string {
	const lines: string[] = [];
	for (const child of Array.from(wrapper.childNodes)) {
		lines.push(serializeNodeToHtml(child).trim());
	}
	return lines.filter((line) => line.length > 0).join("");
}

function serializeNodeToHtml(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return escapeHtml(node.textContent ?? "");
	}
	if (node.nodeType !== Node.ELEMENT_NODE) {
		return "";
	}
	const element = node as HTMLElement;
	const tagName = element.tagName.toUpperCase();
	if (!ALLOWED_TAGS.has(tagName)) {
		return Array.from(element.childNodes).map(serializeNodeToHtml).join("");
	}

	const childrenHtml = Array.from(element.childNodes).map(serializeNodeToHtml).join("");
	if (tagName === "BR") {
		return "<br>";
	}
	if (tagName === "A") {
		const href = element.getAttribute("href");
		const title = element.getAttribute("title");
		const hrefAttr = href ? ` href="${escapeHtml(href)}"` : "";
		const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
		return `<a${hrefAttr}${titleAttr}>${childrenHtml}</a>`;
	}
	const tagLower = tagName.toLowerCase();
	return `<${tagLower}>${childrenHtml}</${tagLower}>`;
}

function extractPlainText(html: string): string {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = html;
	const chunks: string[] = [];
	const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_ALL);
	let node = walker.nextNode();
	while (node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
			if (text.length > 0) {
				chunks.push(text);
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const tagName = (node as HTMLElement).tagName.toUpperCase();
			if (BLOCK_TAGS.has(tagName)) {
				chunks.push("\n");
			}
		}
		node = walker.nextNode();
	}
	return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function escapeHtml(source: string): string {
	return source
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
