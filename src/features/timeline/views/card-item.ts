import { Component, MarkdownRenderer, setIcon, TextAreaComponent, type App } from "obsidian";
import { UI } from "../../../core";
import type { TranslationKey } from "../../../lang";
import { applyRichTextCommand, showRichTextContentMenu } from "../../../ui";
import { extractPlainTextFromMarkdown, toRgba } from "../../../utils";
import { applyTimelineCardMenuCommand } from "../menu-actions";
import { showTimelineCardMenu } from "./card-menu";
import type { TimelineCard } from "./types";

interface TimelineCardItemDeps {
	app: App;
	containerEl: HTMLElement;
	card: TimelineCard;
	t: (key: TranslationKey) => string;
	onCardTouched: () => void;
	onCardDelete: () => void;
	onInsertBefore: () => void;
	onInsertAfter: () => void;
}

export interface TimelineCardItemRenderResult {
	rootEl: HTMLElement;
	dispose: () => void;
}

export function renderTimelineCardItem(deps: TimelineCardItemDeps): TimelineCardItemRenderResult {
	const { card } = deps;
	const rowEl = deps.containerEl.createDiv({ cls: "cna-timeline-row" });
	rowEl.setAttr("data-timeline-card-id", card.id);
	rowEl.setAttr("data-timeline-path", card.timelinePath);

	const timeEl = rowEl.createDiv({ cls: "cna-timeline-row__time" });
	const timeDisplayEl = timeEl.createDiv({ cls: "cna-timeline-row__time-display" });
	const timeEditorWrapEl = timeEl.createDiv({ cls: "cna-timeline-row__time-editor-wrap is-hidden" });
	const timeInputEl = new TextAreaComponent(timeEditorWrapEl).inputEl;
	timeInputEl.addClass("cna-timeline-row__time-editor", "is-hidden");

	const axisEl = rowEl.createDiv({ cls: "cna-timeline-row__axis" });
	axisEl.createDiv({ cls: "cna-timeline-row__axis-line" });
	axisEl.createDiv({ cls: "cna-timeline-row__axis-dot" });

	const rootEl = rowEl.createDiv({ cls: "cna-timeline-card" });
	applyCardTone(rootEl, card.colorHex);

	const headerEl = rootEl.createDiv({ cls: "cna-timeline-card__header" });
	const titleMainEl = headerEl.createDiv({ cls: "cna-timeline-card__title-main" });
	const titleDisplayEl = titleMainEl.createDiv({
		cls: "cna-timeline-card__title cna-timeline-card__title-display",
	});
	const titleEditorWrapEl = titleMainEl.createDiv({ cls: "cna-timeline-card__title-editor-wrap is-hidden" });
	const titleInputEl = titleEditorWrapEl.createEl("input", {
		cls: "cna-timeline-card__title-editor is-hidden",
		attr: {
			type: "text",
		},
	});

	const actionsEl = headerEl.createDiv({ cls: "cna-timeline-card__actions" });
	const menuButtonEl = actionsEl.createEl("button", {
		cls: "cna-timeline-card__action-button",
		attr: {
			type: "button",
			"aria-label": deps.t("feature.timeline.action.menu"),
		},
	});
	setIcon(menuButtonEl, UI.ICON.ELLIPSIS);

	const contentSectionEl = rootEl.createDiv({ cls: "cna-timeline-card__content-section" });
	const contentDisplayEl = contentSectionEl.createDiv({
		cls: "cna-timeline-card__surface cna-timeline-card__surface-display markdown-rendered cna-timeline-card__content-display",
	});
	const contentEditorWrapEl = contentSectionEl.createDiv({ cls: "cna-timeline-card__surface-editor-wrap" });
	const contentEditorEl = new TextAreaComponent(contentEditorWrapEl).inputEl;
	contentEditorEl.addClass(
		"cna-timeline-card__surface",
		"cna-timeline-card__surface-editor",
		"cna-timeline-card__surface-editor-markdown",
		"cna-timeline-card__content-editor",
		"is-hidden",
	);

	const markdownRenderComponent = new Component();
	markdownRenderComponent.load();
	const eventController = new AbortController();
	const eventListenerOptions: AddEventListenerOptions = {
		signal: eventController.signal,
	};

	let isEditingTime = false;
	let isEditingTitle = false;
	let isEditingContent = false;
	let isDestroyed = false;
	let contentRenderVersion = 0;

	const renderTime = (): void => {
		const value = card.timeText.trim();
		timeDisplayEl.setText(value || deps.t("feature.timeline.time.placeholder"));
		timeDisplayEl.toggleClass("is-placeholder", value.length === 0);
		timeInputEl.value = card.timeText;
	};

	const renderTitle = (): void => {
		const value = card.title.trim();
		titleDisplayEl.setText(value || deps.t("feature.timeline.title.placeholder"));
		titleDisplayEl.toggleClass("is-placeholder", value.length === 0);
		titleInputEl.value = card.title;
	};

	const renderContentDisplay = (): void => {
		const renderVersion = ++contentRenderVersion;
		contentDisplayEl.empty();
		if (card.contentPlainText.trim().length === 0) {
			contentDisplayEl.createDiv({
				cls: "cna-timeline-card__placeholder-text",
				text: deps.t("feature.timeline.content.placeholder"),
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

	const setTimeEditing = (editing: boolean): void => {
		if (isEditingTime === editing) {
			return;
		}
		isEditingTime = editing;
		timeDisplayEl.toggleClass("is-hidden", editing);
		timeEditorWrapEl.toggleClass("is-hidden", !editing);
		timeInputEl.toggleClass("is-hidden", !editing);
		if (!editing) {
			timeInputEl.setCssProps({ height: "" });
			return;
		}
		timeInputEl.value = card.timeText;
		timeInputEl.focus();
		timeInputEl.selectionStart = timeInputEl.value.length;
		timeInputEl.selectionEnd = timeInputEl.value.length;
		syncTimeEditorHeight();
	};

	const syncTimeEditorHeight = (): void => {
		syncTextareaHeight(timeInputEl, 1.35, 16);
	};

	const setTitleEditing = (editing: boolean): void => {
		if (isEditingTitle === editing) {
			return;
		}
		isEditingTitle = editing;
		titleDisplayEl.toggleClass("is-hidden", editing);
		titleEditorWrapEl.toggleClass("is-hidden", !editing);
		titleInputEl.toggleClass("is-hidden", !editing);
		if (!editing) {
			return;
		}
		titleInputEl.value = card.title;
		titleInputEl.focus();
		titleInputEl.select();
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

	const syncContentEditorHeight = (): void => {
		syncTextareaHeight(contentEditorEl, 1.5, 18);
	};

	const commitTimeValue = (): void => {
		const nextValue = timeInputEl.value.replace(/\r\n?/g, "\n").trim();
		const changed = nextValue !== card.timeText;
		card.timeText = nextValue;
		setTimeEditing(false);
		renderTime();
		if (changed) {
			card.updatedAt = Date.now();
			deps.onCardTouched();
		}
	};

	const commitTitleValue = (): void => {
		const nextValue = titleInputEl.value.replace(/\r\n?/g, "\n").trim();
		const changed = nextValue !== card.title;
		card.title = nextValue;
		setTitleEditing(false);
		renderTitle();
		if (changed) {
			card.updatedAt = Date.now();
			deps.onCardTouched();
		}
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

	renderTime();
	renderTitle();
	renderContentDisplay();

	timeDisplayEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		setTimeEditing(true);
	}, eventListenerOptions);
	timeInputEl.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			timeInputEl.blur();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			timeInputEl.value = card.timeText;
			commitTimeValue();
		}
	}, eventListenerOptions);
	timeInputEl.addEventListener("input", () => {
		if (!isEditingTime) {
			return;
		}
		syncTimeEditorHeight();
	}, eventListenerOptions);
	timeInputEl.addEventListener("blur", () => {
		commitTimeValue();
	}, eventListenerOptions);

	titleDisplayEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		setTitleEditing(true);
	}, eventListenerOptions);
	titleInputEl.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			titleInputEl.blur();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			titleInputEl.value = card.title;
			commitTitleValue();
		}
	}, eventListenerOptions);
	titleInputEl.addEventListener("blur", () => {
		commitTitleValue();
	}, eventListenerOptions);

	contentDisplayEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		window.requestAnimationFrame(() => {
			if (isDestroyed || !rootEl.isConnected) {
				return;
			}
			setContentEditing(true);
		});
	}, eventListenerOptions);
	contentEditorEl.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			contentEditorEl.value = card.content;
			commitContentEditorValue();
		}
	}, eventListenerOptions);
	contentEditorEl.addEventListener("contextmenu", (event) => {
		if (contentEditorEl.classList.contains("is-hidden")) {
			return;
		}
		showRichTextContentMenu({
			event,
			editorEl: contentEditorEl,
			t: (key) => deps.t(key),
			onCommand: (command) => {
				applyRichTextCommand(command, contentEditorEl);
			},
		});
	}, eventListenerOptions);
	contentEditorEl.addEventListener("input", () => {
		if (!isEditingContent) {
			return;
		}
		syncContentEditorHeight();
	}, eventListenerOptions);
	contentEditorEl.addEventListener("blur", () => {
		commitContentEditorValue();
	}, eventListenerOptions);

	menuButtonEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		showTimelineCardMenu({
			anchorEl: menuButtonEl,
			t: (key) => deps.t(key),
			activeColorHex: card.colorHex,
			onCommand: (command) => {
				const result = applyTimelineCardMenuCommand(command, card);
				if (result === "deleted") {
					deps.onCardDelete();
					return;
				}
				if (result === "insert_before") {
					deps.onInsertBefore();
					return;
				}
				if (result === "insert_after") {
					deps.onInsertAfter();
					return;
				}
				if (result === "updated") {
					applyCardTone(rootEl, card.colorHex);
					deps.onCardTouched();
				}
			},
		});
	}, eventListenerOptions);

	return {
		rootEl: rowEl,
		dispose: () => {
			isDestroyed = true;
			contentRenderVersion += 1;
			eventController.abort();
			markdownRenderComponent.unload();
		},
	};
}

function applyCardTone(rootEl: HTMLElement, colorHex?: string): void {
	if (!colorHex) {
		rootEl.removeClass("has-custom-color");
		rootEl.style.removeProperty("--cna-timeline-card-accent");
		rootEl.style.removeProperty("--cna-timeline-card-accent-alpha");
		return;
	}
	rootEl.addClass("has-custom-color");
	rootEl.style.setProperty("--cna-timeline-card-accent", colorHex);
	rootEl.style.setProperty("--cna-timeline-card-accent-alpha", toRgba(colorHex, 0.25));
}

function syncTextareaHeight(
	editorEl: HTMLTextAreaElement,
	fallbackLineHeightMultiplier: number,
	fallbackLineHeightPx: number,
): void {
	editorEl.setCssProps({ height: "auto" });
	const computedStyle = window.getComputedStyle(editorEl);
	const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight);
	const parsedFontSize = Number.parseFloat(computedStyle.fontSize);
	const fallbackLineHeight = Number.isFinite(parsedFontSize) && parsedFontSize > 0
		? parsedFontSize * fallbackLineHeightMultiplier
		: fallbackLineHeightPx;
	const minHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : fallbackLineHeight;
	const nextHeight = Math.max(editorEl.scrollHeight, Math.ceil(minHeight));
	editorEl.setCssProps({ height: `${nextHeight}px` });
}
