import { Component, MarkdownRenderer, setIcon, TextAreaComponent, type App } from "obsidian";
import { UI } from "../../../core";
import type { TranslationKey } from "../../../lang";
import { extractPlainTextFromMarkdown, toRgba } from "../../../utils";
import { applyAnnotationCardMenuCommand } from "../menu-actions";
import { applyStickyNoteRichTextCommand } from "../../sticky-note/menu-actions";
import { showAnnotationCardMenu } from "./card-menu";
import { showStickyNoteContentMenu } from "../../sticky-note/views/content-menu";
import type { AnnotationCard } from "./types";

interface AnnotationCardItemDeps {
	app: App;
	containerEl: HTMLElement;
	card: AnnotationCard;
	t: (key: TranslationKey) => string;
	isActive: boolean;
	onCardTouched: () => void;
	onCardDelete: () => void;
	onLocate: () => void;
}

export function renderAnnotationCardItem(deps: AnnotationCardItemDeps): () => void {
	const { card } = deps;
	const rootEl = deps.containerEl.createDiv({ cls: "cna-annotation-card" });
	rootEl.setAttr("data-annotation-id", card.id);
	rootEl.toggleClass("is-active", deps.isActive);
	applyCardTone(rootEl, card.colorHex);

	const headerEl = rootEl.createDiv({ cls: "cna-annotation-card__header" });
	const titleMainEl = headerEl.createDiv({ cls: "cna-annotation-card__title-main" });
	const titleDisplayEl = titleMainEl.createDiv({
		cls: "cna-annotation-card__title cna-annotation-card__title-display",
	});

	const actionsEl = headerEl.createDiv({ cls: "cna-annotation-card__actions" });
	const menuButtonEl = actionsEl.createEl("button", {
		cls: "cna-annotation-card__action-button",
		attr: {
			type: "button",
			"aria-label": deps.t("feature.annotation.action.menu"),
		},
	});
	setIcon(menuButtonEl, UI.ICON.ELLIPSIS);

	const contentSectionEl = rootEl.createDiv({ cls: "cna-annotation-card__content-section" });
	const contentDisplayEl = contentSectionEl.createDiv({
		cls: "cna-annotation-card__surface cna-annotation-card__surface-display markdown-rendered cna-annotation-card__content-display",
	});
	const contentEditorWrapEl = contentSectionEl.createDiv({ cls: "cna-annotation-card__surface-editor-wrap" });
	const contentEditorEl = new TextAreaComponent(contentEditorWrapEl).inputEl;
	contentEditorEl.addClass(
		"cna-annotation-card__surface",
		"cna-annotation-card__surface-editor",
		"cna-annotation-card__surface-editor-markdown",
		"cna-annotation-card__content-editor",
		"is-hidden",
	);

	const markdownRenderComponent = new Component();
	markdownRenderComponent.load();

	let isEditingContent = false;
	let isDestroyed = false;
	let contentRenderVersion = 0;

	const syncContentEditorHeight = (): void => {
		contentEditorEl.setCssProps({ height: "auto" });
		const computedStyle = window.getComputedStyle(contentEditorEl);
		const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight);
		const parsedFontSize = Number.parseFloat(computedStyle.fontSize);
		const fallbackLineHeight = Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize * 1.5 : 18;
		const minHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : fallbackLineHeight;
		const nextHeight = Math.max(contentEditorEl.scrollHeight, Math.ceil(minHeight));
		contentEditorEl.setCssProps({ height: `${nextHeight}px` });
	};

	const renderTitle = (): void => {
		const anchorText = card.anchorText.trim() || card.title.trim() || deps.t("feature.annotation.default_title");
		titleDisplayEl.setText(anchorText);
	};

	const renderContentDisplay = (): void => {
		const renderVersion = ++contentRenderVersion;
		contentDisplayEl.empty();
		if (card.contentPlainText.trim().length === 0) {
			contentDisplayEl.createDiv({
				cls: "cna-annotation-card__placeholder-text",
				text: deps.t("feature.annotation.content.placeholder"),
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
			await MarkdownRenderer.render(deps.app, card.content, contentDisplayEl, "", markdownRenderComponent);
		} catch {
			contentDisplayEl.empty();
			contentDisplayEl.setText(card.content);
			return;
		}
		if (isDestroyed || renderVersion !== contentRenderVersion) {
			contentDisplayEl.empty();
		}
	};

	const setContentEditing = (editing: boolean): void => {
		if (isEditingContent === editing) {
			return;
		}
		isEditingContent = editing;
		contentDisplayEl.toggleClass("is-hidden", editing);
		contentEditorEl.toggleClass("is-hidden", !editing);
		if (!editing) {
			contentEditorEl.setCssProps({ height: "" });
			return;
		}
		contentEditorEl.value = card.content;
		contentEditorEl.focus();
		contentEditorEl.selectionStart = contentEditorEl.value.length;
		contentEditorEl.selectionEnd = contentEditorEl.value.length;
		syncContentEditorHeight();
	};

	const commitContentEditorValue = (): void => {
		const nextContent = contentEditorEl.value.replace(/\r\n?/g, "\n");
		const changed = nextContent !== card.content;
		card.content = nextContent;
		card.contentPlainText = extractPlainTextFromMarkdown(nextContent);
		setContentEditing(false);
		renderContentDisplay();
		if (changed) {
			card.updatedAt = Date.now();
			deps.onCardTouched();
		}
	};

	renderTitle();
	renderContentDisplay();

	const shouldSkipCardLocateByClick = (target: EventTarget | null): boolean => {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		if (target.closest(".cna-annotation-card__action-button")) {
			return true;
		}
		if (target.closest(".cna-annotation-card__surface-editor")) {
			return true;
		}
		return false;
	};

	rootEl.addEventListener("click", (event) => {
		if (shouldSkipCardLocateByClick(event.target)) {
			return;
		}
		deps.onLocate();
	});

	contentDisplayEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		deps.onLocate();
		window.requestAnimationFrame(() => {
			if (!rootEl.isConnected) {
				return;
			}
			setContentEditing(true);
		});
	});
	contentEditorEl.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			contentEditorEl.value = card.content;
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
	contentEditorEl.addEventListener("input", () => {
		if (!isEditingContent) {
			return;
		}
		syncContentEditorHeight();
	});
	contentEditorEl.addEventListener("blur", () => {
		commitContentEditorValue();
	});

	menuButtonEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		showAnnotationCardMenu({
			anchorEl: menuButtonEl,
			t: (key) => deps.t(key),
			activeColorHex: card.colorHex,
			onCommand: (command) => {
				const result = applyAnnotationCardMenuCommand(command, card);
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
		markdownRenderComponent.unload();
	};
}

function applyCardTone(rootEl: HTMLElement, colorHex?: string): void {
	if (!colorHex) {
		rootEl.removeClass("has-custom-color");
		rootEl.style.removeProperty("--cna-annotation-card-accent");
		rootEl.style.removeProperty("--cna-annotation-card-accent-alpha");
		return;
	}
	rootEl.addClass("has-custom-color");
	rootEl.style.setProperty("--cna-annotation-card-accent", colorHex);
	rootEl.style.setProperty("--cna-annotation-card-accent-alpha", toRgba(colorHex, 0.25));
}




