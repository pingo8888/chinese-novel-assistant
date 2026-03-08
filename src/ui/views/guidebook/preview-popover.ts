import { Component, type App, MarkdownRenderer, setIcon } from "obsidian";
import type { GuidebookKeywordPreviewItem } from "../../../features/text-detection/rules/guidebook-keyword";
import { UI } from "../../../constants";
import type { TranslationKey } from "../../../lang";

export interface GuidebookPreviewDisplayOptions {
	width: number;
	maxLines: number;
}

export interface GuidebookPreviewPopoverActions {
	onLocate?: (item: GuidebookKeywordPreviewItem) => void;
	onOpen?: (item: GuidebookKeywordPreviewItem) => void;
}

export interface GuidebookPreviewPopoverRenderContext {
	app: App;
	component: Component;
}

export interface GuidebookPreviewPopoverI18n {
	t: (key: TranslationKey) => string;
}

const PREVIEW_MIN_WIDTH = 200;
const PREVIEW_MAX_WIDTH = 800;
const PREVIEW_MIN_LINES = 1;
const PREVIEW_MAX_LINES = 30;

export class GuidebookPreviewPopover {
	private readonly rootEl: HTMLElement;
	private readonly headerMainEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly metaEl: HTMLElement;
	private readonly aliasSectionEl: HTMLElement;
	private readonly aliasLabelEl: HTMLElement;
	private readonly aliasValueEl: HTMLElement;
	private readonly contentEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly locateButtonEl: HTMLButtonElement;
	private readonly openButtonEl: HTMLButtonElement;
	private readonly actions: GuidebookPreviewPopoverActions;
	private readonly renderContext?: GuidebookPreviewPopoverRenderContext;
	private readonly t: (key: TranslationKey) => string;
	private currentPreviewItem: GuidebookKeywordPreviewItem | null = null;
	private currentDisplayOptions: Pick<GuidebookPreviewDisplayOptions, "maxLines"> | null = null;
	private visible = false;
	private contentRenderVersion = 0;

	constructor(
		hostEl?: HTMLElement,
		actions?: GuidebookPreviewPopoverActions,
		renderContext?: GuidebookPreviewPopoverRenderContext,
		i18n?: GuidebookPreviewPopoverI18n,
	) {
		this.actions = actions ?? {};
		this.renderContext = renderContext;
		this.t = i18n?.t ?? ((key) => key);
		this.rootEl = (hostEl ?? document.body).createDiv({ cls: "cna-guidebook-preview-popover" });
		this.rootEl.hide();
		const headerEl = this.rootEl.createDiv({ cls: "cna-guidebook-preview-popover__header" });
		this.headerMainEl = headerEl.createDiv({ cls: "cna-guidebook-preview-popover__header-main" });
		this.titleEl = this.headerMainEl.createDiv({ cls: "cna-guidebook-preview-popover__title" });
		this.metaEl = this.headerMainEl.createDiv({ cls: "cna-guidebook-preview-popover__meta" });
		const actionGroupEl = headerEl.createDiv({ cls: "cna-guidebook-preview-popover__actions" });
		this.locateButtonEl = actionGroupEl.createEl("button", {
			cls: "cna-guidebook-preview-popover__action-button",
			attr: {
				type: "button",
				"aria-label": this.t("feature.right_sidebar.guidebook.preview.action.locate"),
			},
		});
		setIcon(this.locateButtonEl, UI.icon.search);
		this.openButtonEl = actionGroupEl.createEl("button", {
			cls: "cna-guidebook-preview-popover__action-button",
			attr: {
				type: "button",
				"aria-label": this.t("feature.right_sidebar.guidebook.preview.action.open"),
			},
		});
		setIcon(this.openButtonEl, UI.icon.pencil);

		this.aliasSectionEl = this.rootEl.createDiv({ cls: "cna-guidebook-preview-popover__aliases" });
		this.aliasLabelEl = this.aliasSectionEl.createDiv({
			cls: "cna-guidebook-preview-popover__alias-label",
			text: this.t("feature.right_sidebar.guidebook.preview.alias_label"),
		});
		this.aliasValueEl = this.aliasSectionEl.createDiv({ cls: "cna-guidebook-preview-popover__alias-value" });
		this.contentEl = this.rootEl.createDiv({ cls: "cna-guidebook-preview-popover__content" });
		this.contentEl.addClass("markdown-rendered");
		this.emptyEl = this.rootEl.createDiv({
			cls: "cna-guidebook-preview-popover__empty",
			text: this.t("feature.right_sidebar.guidebook.preview.empty_content"),
		});
		this.locateButtonEl.addEventListener("click", () => {
			if (!this.currentPreviewItem) {
				return;
			}
			this.actions.onLocate?.(this.currentPreviewItem);
		});
		this.openButtonEl.addEventListener("click", () => {
			if (!this.currentPreviewItem) {
				return;
			}
			this.actions.onOpen?.(this.currentPreviewItem);
		});
	}

	show(
		previewItem: GuidebookKeywordPreviewItem,
		anchorRect: DOMRect,
		options: GuidebookPreviewDisplayOptions,
	): void {
		const width = clamp(options.width, PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH);
		const maxLines = clamp(options.maxLines, PREVIEW_MIN_LINES, PREVIEW_MAX_LINES);

		this.currentPreviewItem = previewItem;
		const parsed = parseAliasesAndContent(typeof previewItem.content === "string" ? previewItem.content : "");
		this.titleEl.setText(formatPreviewTitle(previewItem.title, parsed.status));
		this.metaEl.setText(this.resolveMetaText(previewItem));
		const normalizedContent = parsed.content;
		if (parsed.aliases.length > 0) {
			this.aliasValueEl.setText(parsed.aliases.join(" "));
			this.aliasSectionEl.toggleClass("is-visible", true);
		} else {
			this.aliasValueEl.empty();
			this.aliasSectionEl.toggleClass("is-visible", false);
		}
		const renderVersion = ++this.contentRenderVersion;
		void this.renderPreviewContent(normalizedContent, previewItem.sourcePath, renderVersion);
		this.contentEl.toggleClass("is-empty", normalizedContent.length === 0);
		this.emptyEl.toggleClass("is-visible", normalizedContent.length === 0);
		this.rootEl.style.width = `${width}px`;
		this.rootEl.setCssProps({
			"max-height": "",
		});
		this.currentDisplayOptions = { maxLines };

		this.rootEl.show();
		this.rootEl.toggleClass("is-positioning", true);
		this.rootEl.setCssProps({
			left: "0px",
			top: "0px",
		});
		this.applyContentHeightLimit();
		this.rootEl.toggleClass("is-visible", true);
		const bounds = this.rootEl.getBoundingClientRect();
		const position = this.resolvePosition(anchorRect, bounds);
		this.rootEl.setCssProps({
			left: `${position.left}px`,
			top: `${position.top}px`,
		});
		this.rootEl.toggleClass("is-positioning", false);
		this.visible = true;
	}

	hide(): void {
		if (!this.visible) {
			return;
		}
		this.visible = false;
		this.currentPreviewItem = null;
		this.currentDisplayOptions = null;
		this.contentRenderVersion += 1;
		this.rootEl.toggleClass("is-visible", false);
		this.rootEl.hide();
	}

	containsTarget(target: EventTarget | null): boolean {
		return target instanceof Node && this.rootEl.contains(target);
	}

	getElement(): HTMLElement {
		return this.rootEl;
	}

	destroy(): void {
		this.hide();
		this.rootEl.remove();
	}

	private resolveMetaText(previewItem: GuidebookKeywordPreviewItem): string {
		const sourceName = (previewItem.sourcePath.split("/").pop() ?? previewItem.sourcePath).replace(/\.md$/i, "");
		if (previewItem.categoryTitle.trim().length === 0) {
			return sourceName;
		}
		return `${sourceName} / ${previewItem.categoryTitle}`;
	}

	private async renderPreviewContent(
		content: string,
		sourcePath: string,
		renderVersion: number,
	): Promise<void> {
		this.contentEl.empty();
		if (content.length === 0) {
			return;
		}
		if (!this.renderContext) {
			this.contentEl.setText(content);
			return;
		}
		try {
			await MarkdownRenderer.render(
				this.renderContext.app,
				content,
				this.contentEl,
				sourcePath,
				this.renderContext.component,
			);
			if (renderVersion !== this.contentRenderVersion) {
				this.contentEl.empty();
				return;
			}
			this.applyContentHeightLimit();
		} catch (error) {
			console.error(error);
			if (renderVersion === this.contentRenderVersion) {
				this.contentEl.empty();
				this.contentEl.setText(content);
				this.applyContentHeightLimit();
			}
		}
	}

	private applyContentHeightLimit(): void {
		const options = this.currentDisplayOptions;
		if (!options) {
			return;
		}
		const lineHeightPx = this.resolveContentLineHeightPx();
		const maxByLines = Math.max(24, Math.round(options.maxLines * lineHeightPx));
		this.contentEl.setCssProps({
			"max-height": `${maxByLines}px`,
		});
	}

	private resolveContentLineHeightPx(): number {
		const computedStyle = window.getComputedStyle(this.contentEl);
		const lineHeight = Number.parseFloat(computedStyle.lineHeight);
		if (Number.isFinite(lineHeight) && lineHeight > 0) {
			return lineHeight;
		}
		const fontSize = Number.parseFloat(computedStyle.fontSize);
		const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
		return safeFontSize * 1.65;
	}

	private resolvePosition(anchorRect: DOMRect, popoverBounds: DOMRect): { left: number; top: number } {
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const gap = 10;
		const edgePadding = 8;

		let left = anchorRect.right + gap;
		if (left + popoverBounds.width > viewportWidth - edgePadding) {
			left = anchorRect.left - popoverBounds.width - gap;
		}
		left = clamp(left, edgePadding, Math.max(edgePadding, viewportWidth - popoverBounds.width - edgePadding));

		let top = anchorRect.top;
		if (top + popoverBounds.height > viewportHeight - edgePadding) {
			top = anchorRect.bottom - popoverBounds.height;
		}
		top = clamp(top, edgePadding, Math.max(edgePadding, viewportHeight - popoverBounds.height - edgePadding));

		return { left, top };
	}
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
}

function parseAliasesAndContent(content: string): { aliases: string[]; content: string; status: "死亡" | "失效" | null } {
	const lines = content.split(/\r?\n/);
	const aliasSet = new Set<string>();
	const keptLines: string[] = [];
	let status: "死亡" | "失效" | null = null;
	for (const line of lines) {
		const statusMatch = line.match(/【状态】\s*[:：]?\s*(死亡|失效)/);
		if (statusMatch && statusMatch[1] && !status) {
			status = statusMatch[1] as "死亡" | "失效";
		}
		if (statusMatch) {
			continue;
		}

		const aliasMatch = line.match(/【别名】\s*[:：]?\s*(.+)$/);
		if (!aliasMatch) {
			keptLines.push(line);
			continue;
		}
		const aliasText = (aliasMatch[1] ?? "").trim();
		if (aliasText.length === 0) {
			continue;
		}
		for (const alias of aliasText.split(/[，,]/)) {
			const normalizedAlias = alias.trim();
			if (normalizedAlias.length > 0) {
				aliasSet.add(normalizedAlias);
			}
		}
	}
	const normalizedLines = normalizeListBoundaryLines(keptLines);
	const normalizedContent = normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	return {
		aliases: Array.from(aliasSet),
		content: normalizedContent,
		status,
	};
}

function normalizeListBoundaryLines(lines: string[]): string[] {
	const normalized: string[] = [];
	for (const line of lines) {
		const previousLine = normalized[normalized.length - 1] ?? "";
		const previousTrimmed = previousLine.trim();
		const currentTrimmed = line.trim();
		const previousIsListItem = isMarkdownListItemLine(previousTrimmed);
		const currentIsBlank = currentTrimmed.length === 0;
		const currentIsListItem = isMarkdownListItemLine(currentTrimmed);
		const currentIsIndented = /^[ \t]/.test(line);
		if (previousIsListItem && !currentIsBlank && !currentIsListItem && !currentIsIndented) {
			normalized.push("");
		}
		normalized.push(line);
	}
	return normalized;
}

function isMarkdownListItemLine(line: string): boolean {
	return /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

function formatPreviewTitle(baseTitle: string, status: "死亡" | "失效" | null): string {
	if (!status) {
		return baseTitle;
	}
	return `${baseTitle}【${status}】`;
}
