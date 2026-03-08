import { Component, MarkdownRenderer, Notice, setIcon, TextAreaComponent, type App, type TFile } from "obsidian";
import {
	STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
	STICKY_NOTE_FLOAT_LEFT_GAP,
	STICKY_NOTE_FLOAT_MIN_HEIGHT,
	STICKY_NOTE_FLOAT_MIN_WIDTH,
	UI,
	resolveStickyNoteFloatDefaultHeightByRows,
} from "../../../constants";
import type { TranslationKey } from "../../../lang";
import type { StickyNoteCardModel, StickyNoteSortMode, StickyNoteViewOptions } from "./types";
import { showStickyNoteContentMenu } from "./content-menu";
import { applyStickyNoteCardMenuCommand, applyStickyNoteRichTextCommand } from "../../../features/sticky-note/menu-actions";
import { promptVaultImageFile } from "../../modals/vault-image-picker-modal";
import { showStickyNoteCardMenu } from "./card-menu";
import { openImagePreview } from "../../modals/image-preview-modal";
import { extractPlainTextFromMarkdown, normalizeMarkdownLineEndings } from "../../../features/sticky-note/markdown-utils";

interface StickyNoteCardItemDeps {
	app: App;
	containerEl: HTMLElement;
	card: StickyNoteCardModel;
	sortMode: StickyNoteSortMode;
	viewOptions: StickyNoteViewOptions;
	t: (key: TranslationKey) => string;
	onCardTouched: () => void;
	onImageExpandedChange?: (isExpanded: boolean) => void;
	onCardDelete: () => void;
}

const MIN_CONTENT_ROWS = 1;

export function renderStickyNoteCardItem(deps: StickyNoteCardItemDeps): () => void {
	const { card } = deps;
	const rootEl = deps.containerEl.createDiv({ cls: "cna-sticky-note-card" });
	applyCardTone(rootEl, card.colorHex);
	rootEl.style.setProperty("--cna-sticky-note-content-rows", `${resolveContentRows(deps.viewOptions.defaultRows)}`);

	const headerEl = rootEl.createDiv({ cls: "cna-sticky-note-card__header" });
	const timeEl = headerEl.createDiv({ cls: "cna-sticky-note-card__time" });
	const timeDragIndicatorEl = timeEl.createSpan({
		cls: "cna-sticky-note-card__time-drag-indicator",
		attr: {
			"aria-hidden": "true",
		},
	});
	setIcon(timeDragIndicatorEl, UI.icon.gripVertical);
	const timeTextEl = timeEl.createSpan({ cls: "cna-sticky-note-card__time-text" });
	const timePinEl = timeEl.createSpan({
		cls: "cna-sticky-note-card__time-pin is-hidden",
	});
	setIcon(timePinEl, UI.icon.pin);
	const actionsEl = headerEl.createDiv({ cls: "cna-sticky-note-card__actions" });

	const pinButtonEl = actionsEl.createEl("button", {
		cls: "cna-sticky-note-card__action-button cna-sticky-note-card__action-button--float",
		attr: {
			type: "button",
			"aria-label": deps.t("feature.right_sidebar.sticky_note.card.action.float.tooltip"),
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
	const contentEditorWrapEl = contentSectionEl.createDiv({
		cls: "cna-sticky-note-card__surface-editor-wrap",
	});
	const contentEditorEl = new TextAreaComponent(contentEditorWrapEl).inputEl;
	contentEditorEl.addClass(
		"cna-sticky-note-card__surface",
		"cna-sticky-note-card__surface-editor",
		"cna-sticky-note-card__surface-editor-markdown",
	);

	const tagsBarEl = rootEl.createDiv({ cls: "cna-sticky-note-card__tags-bar" });
	const tagsMainEl = tagsBarEl.createDiv({ cls: "cna-sticky-note-card__tags-main" });
	const tagsEditorEl = tagsMainEl.createDiv({
		cls: "cna-sticky-note-card__surface cna-sticky-note-card__surface-editor cna-sticky-note-card__tags-editor",
		attr: {
			contenteditable: "true",
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
	const markdownRenderComponent = new Component();
	markdownRenderComponent.load();

	let isEditingTags = false;
	let contentRenderVersion = 0;
	let isDestroyed = false;

	const updateFloatingActionButton = (): void => {
		pinButtonEl.toggleClass("is-unfloat", !card.isFloating);
		pinButtonEl.setAttr(
			"aria-label",
			card.isFloating
				? deps.t("feature.right_sidebar.sticky_note.card.action.unfloat.tooltip")
				: deps.t("feature.right_sidebar.sticky_note.card.action.float.tooltip"),
		);
	};

	const renderHeader = (): void => {
		timeDragIndicatorEl.toggleClass("is-visible", card.isFloating);
		timeTextEl.setText(formatDateTime(resolveHeaderTimestamp(card, deps.sortMode)));
		timePinEl.toggleClass("is-hidden", !card.isPinned);
		timePinEl.setAttr("aria-label", deps.t("feature.right_sidebar.sticky_note.card.menu.pin"));
	};

	const renderContentDisplay = (): void => {
		const renderVersion = ++contentRenderVersion;
		contentDisplayEl.empty();
		if (card.contentPlainText.trim().length === 0) {
			contentDisplayEl.createDiv({
				cls: "cna-sticky-note-card__placeholder-text",
				text: deps.t("feature.right_sidebar.sticky_note.card.content.placeholder"),
			});
			return;
		}
		void renderMarkdownContent(renderVersion);
	};

	const renderMarkdownContent = async (renderVersion: number): Promise<void> => {
		if (isDestroyed) {
			return;
		}
		markdownRenderComponent.unload();
		markdownRenderComponent.load();
		contentDisplayEl.empty();
		try {
			await MarkdownRenderer.render(deps.app, card.contentMarkdown, contentDisplayEl, "", markdownRenderComponent);
		} catch (_error) {
			contentDisplayEl.empty();
			contentDisplayEl.setText(card.contentMarkdown);
			return;
		}
		if (isDestroyed || renderVersion !== contentRenderVersion) {
			contentDisplayEl.empty();
		}
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

	const setContentEditing = (
		editing: boolean,
		caretIndex?: number,
		pointer?: { clientX: number; clientY: number },
	): void => {
		contentDisplayEl.toggleClass("is-hidden", editing);
		contentEditorEl.toggleClass("is-hidden", !editing);
		if (!editing) {
			return;
		}
		contentEditorEl.value = card.contentMarkdown;
		const preservedScrollTop = contentDisplayEl.scrollTop;
		const preservedScrollLeft = contentDisplayEl.scrollLeft;
		contentEditorEl.scrollTop = preservedScrollTop;
		contentEditorEl.scrollLeft = preservedScrollLeft;
		contentEditorEl.focus();
		let resolvedCaretIndex = typeof caretIndex === "number"
			? Math.max(0, Math.min(contentEditorEl.value.length, caretIndex))
			: contentEditorEl.value.length;
		if (pointer) {
			resolvedCaretIndex = resolveTextareaCaretIndexFromClientPoint(
				contentEditorEl,
				pointer.clientX,
				pointer.clientY,
				resolvedCaretIndex,
			);
		}
		contentEditorEl.setSelectionRange(resolvedCaretIndex, resolvedCaretIndex);
		// Keep visual viewport stable when switching from rendered content to textarea editing.
		contentEditorEl.scrollTop = preservedScrollTop;
		contentEditorEl.scrollLeft = preservedScrollLeft;
		window.requestAnimationFrame(() => {
			contentEditorEl.scrollTop = preservedScrollTop;
			contentEditorEl.scrollLeft = preservedScrollLeft;
		});
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
					tabindex: "0",
				},
			});
			imageEl.draggable = false;
			imageEl.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				openImagePreview(deps.app, image.src, image.name);
			});
			imageEl.addEventListener("keydown", (event) => {
				if (event.key !== "Enter" && event.key !== " ") {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				openImagePreview(deps.app, image.src, image.name);
			});
			const removeButtonEl = imageCardEl.createEl("button", {
				cls: "cna-sticky-note-card__image-remove",
				attr: {
					type: "button",
					"aria-label": deps.t("feature.right_sidebar.sticky_note.card.image.remove.tooltip"),
				},
			});
			setIcon(removeButtonEl, UI.icon.close);
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
		setIcon(addButtonEl, UI.icon.plus);
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
		deps.onImageExpandedChange?.(true);
		deps.onCardTouched();
	};

	const commitContentEditorValue = (): void => {
		const nextMarkdown = normalizeMarkdownValue(contentEditorEl.value);
		const nextPlainText = extractPlainTextFromMarkdown(nextMarkdown);
		const changed = nextMarkdown !== card.contentMarkdown;
		card.contentMarkdown = nextMarkdown;
		card.contentPlainText = nextPlainText;
		setContentEditing(false);
		renderContentDisplay();
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
	updateFloatingActionButton();
	renderHeader();
	renderContentDisplay();
	renderTagsDisplay();
	renderImageToggle();
	renderImages();

	contentDisplayEl.addEventListener("click", (event) => {
		const caretIndex = resolveMarkdownCaretIndexFromDisplayPoint(
			contentDisplayEl,
			card.contentMarkdown,
			event.clientX,
			event.clientY,
		);
		setContentEditing(true, caretIndex ?? undefined, {
			clientX: event.clientX,
			clientY: event.clientY,
		});
	});
	const handleDisplayWheel = (event: WheelEvent): void => {
		// Display mode should not respond to wheel scrolling.
		if (!contentDisplayEl.hasClass("is-hidden")) {
			event.preventDefault();
			event.stopPropagation();
		}
	};
	contentDisplayEl.addEventListener("wheel", handleDisplayWheel, { passive: false });

	contentEditorEl.addEventListener("keydown", (evt) => {
		if (evt.key === "Escape") {
			contentEditorEl.value = card.contentMarkdown;
			commitContentEditorValue();
		}
	});
	contentEditorEl.addEventListener("contextmenu", (event) => {
		if (contentEditorEl.classList.contains("is-hidden")) {
			return;
		}
		showStickyNoteContentMenu({
			event,
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
		insertPlainTextAtSelection(tagsEditorEl, text);
	});
	tagsEditorEl.addEventListener("blur", () => {
		commitTagsEditorValue();
	});

	imageToggleButtonEl.addEventListener("click", () => {
		card.isImageExpanded = !card.isImageExpanded;
		renderImageToggle();
		renderImages();
		deps.onImageExpandedChange?.(card.isImageExpanded);
	});

	pinButtonEl.addEventListener("click", () => {
		card.isFloating = !card.isFloating;
		if (card.isFloating) {
			const defaultFloatHeight = resolveStickyNoteFloatDefaultHeightByRows(deps.viewOptions.defaultRows);
			const cardRect = rootEl.getBoundingClientRect();
			const contentSurfaceEl = contentSectionEl.querySelector<HTMLElement>(".cna-sticky-note-card__surface");
			const contentRect = contentSurfaceEl?.getBoundingClientRect();
			if (shouldUseDefaultFloatMetric(card.floatW, STICKY_NOTE_FLOAT_DEFAULT_WIDTH)) {
				card.floatW = normalizeFloatSize(cardRect.width, STICKY_NOTE_FLOAT_DEFAULT_WIDTH, STICKY_NOTE_FLOAT_MIN_WIDTH);
			} else {
				card.floatW = normalizeFloatSize(card.floatW, STICKY_NOTE_FLOAT_DEFAULT_WIDTH, STICKY_NOTE_FLOAT_MIN_WIDTH);
			}
			if (shouldUseDefaultFloatMetric(card.floatH, defaultFloatHeight)) {
				card.floatH = normalizeFloatSize(contentRect?.height ?? cardRect.height, defaultFloatHeight, STICKY_NOTE_FLOAT_MIN_HEIGHT);
			} else {
				card.floatH = normalizeFloatSize(card.floatH, defaultFloatHeight, STICKY_NOTE_FLOAT_MIN_HEIGHT);
			}
			if (!isFiniteNumber(card.floatX) && !isFiniteNumber(card.floatY)) {
				card.floatX = 0;
				card.floatY = 0;
			}
			if (Math.round(card.floatX) === 0 && Math.round(card.floatY) === 0) {
				const initialPosition = resolveInitialFloatingPosition(cardRect, card.floatW);
				card.floatX = initialPosition.x;
				card.floatY = initialPosition.y;
			}
		}
		card.updatedAt = Date.now();
		updateFloatingActionButton();
		renderHeader();
		deps.onCardTouched();
	});

	menuButtonEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		showStickyNoteCardMenu({
			anchorEl: menuButtonEl,
			t: (key) => deps.t(key),
			activeColorHex: card.colorHex,
			isPinned: card.isPinned,
			allowPinToggle: !card.isFloating,
			allowDelete: true,
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

	return () => {
		isDestroyed = true;
		contentRenderVersion += 1;
		contentDisplayEl.removeEventListener("wheel", handleDisplayWheel);
		markdownRenderComponent.unload();
	};
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

function normalizeFloatSize(value: number, fallback: number, min: number): number {
	if (isFiniteNumber(value) && value >= min) {
		return Math.round(value);
	}
	return fallback;
}

function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value);
}

function shouldUseDefaultFloatMetric(value: number, defaultValue: number): boolean {
	if (!Number.isFinite(value) || value <= 0) {
		return true;
	}
	return Math.abs(value - defaultValue) <= 1;
}

function resolveInitialFloatingPosition(cardRect: DOMRect, floatingWidth: number): { x: number; y: number } {
	const viewportWidth = Math.max(1, window.innerWidth);
	const width = Math.max(STICKY_NOTE_FLOAT_MIN_WIDTH, Math.round(floatingWidth));
	const preferredLeftX = Math.round(cardRect.left - width - STICKY_NOTE_FLOAT_LEFT_GAP);
	if (preferredLeftX >= 0) {
		return {
			x: preferredLeftX,
			y: Math.max(0, Math.round(cardRect.top)),
		};
	}
	const fallbackRightX = Math.round(cardRect.right + STICKY_NOTE_FLOAT_LEFT_GAP);
	if (fallbackRightX + width <= viewportWidth) {
		return {
			x: fallbackRightX,
			y: Math.max(0, Math.round(cardRect.top)),
		};
	}
	return {
		x: Math.max(0, Math.round(cardRect.left)),
		y: Math.max(0, Math.round(cardRect.top)),
	};
}

function parseTags(source: string): string[] {
	const matches = source.match(/#[^\s#]+/g);
	return matches ? matches : [];
}

function normalizeTagsText(source: string): string {
	const tags = parseTags(source);
	return dedupeTagTokens(tags).join(" ");
}

function dedupeTagTokens(tags: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const tag of tags) {
		const normalized = tag.trim();
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		result.push(normalized);
	}
	return result;
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

function insertPlainTextAtSelection(targetEl: HTMLElement, text: string): void {
	if (text.length === 0) {
		return;
	}
	targetEl.focus();
	const selection = window.getSelection();
	if (!selection) {
		targetEl.append(document.createTextNode(text));
		placeCaretAtEnd(targetEl);
		return;
	}
	let activeRange: Range | null = null;
	if (selection.rangeCount > 0) {
		const candidateRange = selection.getRangeAt(0);
		if (targetEl.contains(candidateRange.commonAncestorContainer)) {
			activeRange = candidateRange;
		}
	}
	if (!activeRange) {
		activeRange = document.createRange();
		activeRange.selectNodeContents(targetEl);
		activeRange.collapse(false);
	}
	activeRange.deleteContents();
	const textNode = document.createTextNode(text);
	activeRange.insertNode(textNode);
	activeRange.setStartAfter(textNode);
	activeRange.collapse(true);
	selection.removeAllRanges();
	selection.addRange(activeRange);
}

function normalizeMarkdownValue(source: string): string {
	return normalizeMarkdownLineEndings(source);
}

function resolveMarkdownCaretIndexFromDisplayPoint(
	containerEl: HTMLElement,
	markdown: string,
	clientX: number,
	clientY: number,
): number | null {
	const caretPoint = resolveCaretPointByClientPosition(clientX, clientY);
	if (!caretPoint) {
		return null;
	}
	if (!containerEl.contains(caretPoint.node)) {
		return null;
	}
	const range = document.createRange();
	range.setStart(containerEl, 0);
	range.setEnd(caretPoint.node, caretPoint.offset);
	const visiblePrefix = normalizeVisibleTextPrefix(range.toString());
	return mapVisibleTextOffsetToMarkdownIndex(markdown, visiblePrefix.length);
}

function resolveCaretPointByClientPosition(clientX: number, clientY: number): { node: Node; offset: number } | null {
	const docWithCaret = document as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	};
	if (typeof docWithCaret.caretPositionFromPoint === "function") {
		const caretPosition = docWithCaret.caretPositionFromPoint(clientX, clientY);
		if (caretPosition) {
			return {
				node: caretPosition.offsetNode,
				offset: caretPosition.offset,
			};
		}
	}
	return null;
}

function normalizeVisibleTextPrefix(source: string): string {
	return source
		.replace(/\r\n?/g, "\n")
		.replace(/\u00A0/g, " ")
		.replace(/[ \t\f\v]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/^\n+/, "");
}

function mapVisibleTextOffsetToMarkdownIndex(markdown: string, plainOffset: number): number {
	if (plainOffset <= 0) {
		return 0;
	}
	const plainText = extractPlainTextForCaretMapping(markdown);
	if (plainText.length === 0) {
		return 0;
	}
	const clampedOffset = Math.max(0, Math.min(plainText.length, plainOffset));
	const boundaryMap = buildPlainToMarkdownBoundaryMap(markdown, plainText);
	return boundaryMap[clampedOffset] ?? markdown.length;
}

function resolveTextareaCaretIndexFromClientPoint(
	textareaEl: HTMLTextAreaElement,
	clientX: number,
	clientY: number,
	fallbackIndex: number,
): number {
	const computedStyle = window.getComputedStyle(textareaEl);
	const lineHeight = parsePixelValue(computedStyle.lineHeight, 20);
	const paddingTop = parsePixelValue(computedStyle.paddingTop, 0);
	const paddingLeft = parsePixelValue(computedStyle.paddingLeft, 0);
	const rect = textareaEl.getBoundingClientRect();
	if (lineHeight <= 0 || rect.height <= 0) {
		return fallbackIndex;
	}

	const relativeY = clientY - rect.top - paddingTop + textareaEl.scrollTop;
	const lines = textareaEl.value.split("\n");
	if (lines.length === 0) {
		return 0;
	}
	const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(relativeY / lineHeight)));
	const lineText = lines[lineIndex] ?? "";
	const relativeX = Math.max(0, clientX - rect.left - paddingLeft + textareaEl.scrollLeft);
	const columnIndex = resolveColumnIndexByPixelX(lineText, relativeX, computedStyle);

	let index = 0;
	for (let i = 0; i < lineIndex; i += 1) {
		index += (lines[i]?.length ?? 0) + 1;
	}
	index += columnIndex;
	return Math.max(0, Math.min(textareaEl.value.length, index));
}

function resolveColumnIndexByPixelX(
	lineText: string,
	targetX: number,
	computedStyle: CSSStyleDeclaration,
): number {
	if (targetX <= 0 || lineText.length === 0) {
		return 0;
	}
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) {
		return Math.min(lineText.length, Math.round(targetX / 8));
	}
	context.font = computedStyle.font;
	let accumulated = 0;
	for (let index = 0; index < lineText.length; index += 1) {
		const charWidth = context.measureText(lineText[index] ?? "").width;
		if (targetX <= accumulated + charWidth / 2) {
			return index;
		}
		accumulated += charWidth;
	}
	return lineText.length;
}

function parsePixelValue(value: string, fallback: number): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPlainToMarkdownBoundaryMap(markdown: string, plainText: string): number[] {
	const boundaries = new Array<number>(plainText.length + 1).fill(markdown.length);
	boundaries[0] = 0;
	let markdownIndex = 0;
	let plainIndex = 0;

	while (markdownIndex < markdown.length && plainIndex < plainText.length) {
		if (markdown[markdownIndex] === plainText[plainIndex]) {
			boundaries[plainIndex + 1] = markdownIndex + 1;
			markdownIndex += 1;
			plainIndex += 1;
			continue;
		}
		markdownIndex += 1;
	}

	return boundaries;
}

function extractPlainTextForCaretMapping(markdown: string): string {
	return markdown
		.replace(/\r\n?/g, "\n")
		.replace(/```[\s\S]*?```/g, (codeBlock) => codeBlock.replace(/[`]/g, ""))
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^\s*>\s?/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*\d+\.\s+/gm, "")
		.replace(/[*_~`>#]/g, "")
		.replace(/[ \t\f\v]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/^\n+/, "")
		.replace(/\n+$/, "");
}
