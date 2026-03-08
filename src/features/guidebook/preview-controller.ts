import { EditorView } from "@codemirror/view";
import { MarkdownView, TFile, type Plugin } from "obsidian";
import type { ChineseNovelAssistantSettings } from "../../settings/settings";
import type { GuidebookKeywordPreviewItem } from "../text-detection/rules/guidebook-keyword";
import { GuidebookPreviewPopover } from "../../ui/views/guidebook/preview-popover";
import type { TranslationKey } from "../../lang";

interface GuidebookPreviewControllerOptions {
	getSettings: () => ChineseNovelAssistantSettings;
	resolveKeywordPreviewItem: (view: EditorView, keyword: string) => GuidebookKeywordPreviewItem | null;
	t: (key: TranslationKey) => string;
}

const GUIDEBOOK_KEYWORD_HIT_CLASS = "cna-guidebook-keyword-hit";
const GUIDEBOOK_SIDEBAR_H2_ROW_CLASS = "cna-guidebook-tree__row--h2";
const SIDEBAR_PREVIEW_ITEM_PROP = "__cnaGuidebookPreviewItem";
const PREVIEW_SHOW_DELAY = 160;
const PREVIEW_HIDE_DELAY = 120;

type SidebarPreviewCarrierElement = HTMLElement & {
	[SIDEBAR_PREVIEW_ITEM_PROP]?: unknown;
};

export class GuidebookPreviewController {
	private readonly plugin: Plugin;
	private readonly getSettings: () => ChineseNovelAssistantSettings;
	private readonly resolveKeywordPreviewItem: (view: EditorView, keyword: string) => GuidebookKeywordPreviewItem | null;
	private readonly previewPopover: GuidebookPreviewPopover;
	private pendingShowTimer: number | null = null;
	private pendingHideTimer: number | null = null;
	private pendingAnchorEl: HTMLElement | null = null;
	private pendingPreviewItem: GuidebookKeywordPreviewItem | null = null;
	private started = false;

	constructor(
		plugin: Plugin,
		options: GuidebookPreviewControllerOptions,
	) {
		this.plugin = plugin;
		this.getSettings = options.getSettings;
		this.resolveKeywordPreviewItem = options.resolveKeywordPreviewItem;
		this.previewPopover = new GuidebookPreviewPopover(document.body, {
			onLocate: (item) => {
				void this.searchKeywordInGlobalSearch(item.keyword);
			},
			onOpen: (item) => {
				void this.openSettingFileAtHeading(item.sourcePath, item.title);
			},
		}, {
			app: this.plugin.app,
			component: this.plugin,
		}, {
			t: options.t,
		});
	}

	start(): void {
		if (this.started) {
			return;
		}
		this.started = true;
		this.plugin.registerDomEvent(document, "mouseover", this.onMouseOver);
		this.plugin.registerDomEvent(document, "mouseout", this.onMouseOut);
		this.plugin.registerDomEvent(document, "mousedown", this.onMouseDown);
		this.plugin.registerDomEvent(this.previewPopover.getElement(), "mouseenter", this.onPopoverMouseEnter);
		this.plugin.registerDomEvent(this.previewPopover.getElement(), "mouseleave", this.onPopoverMouseLeave);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof MarkdownView || !leaf) {
					this.hideImmediately();
				}
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", () => {
				this.hideImmediately();
			}),
		);
		this.plugin.register(() => {
			this.dispose();
		});
	}

	handleSettingsChange(): void {
		const settings = this.getSettings();
		if (!settings.guidebookPreviewMainHoverEnabled && !settings.guidebookPreviewSidebarHoverEnabled) {
			this.hideImmediately();
		}
	}

	dispose(): void {
		this.clearTimers();
		this.previewPopover.destroy();
	}

	private readonly onMouseOver = (event: MouseEvent): void => {
		const settings = this.getSettings();
		if (!settings.guidebookPreviewMainHoverEnabled && !settings.guidebookPreviewSidebarHoverEnabled) {
			return;
		}
		const targetEl = event.target instanceof Element ? event.target : null;
		if (!targetEl) {
			return;
		}
		if (this.previewPopover.containsTarget(targetEl)) {
			this.clearHideTimer();
			return;
		}
		const hoverContext = this.resolveHoverContext(targetEl, settings);
		if (!hoverContext) {
			return;
		}
		if (!hoverContext.previewItem) {
			this.scheduleHide();
			return;
		}
		this.scheduleShow(hoverContext.anchorEl, hoverContext.previewItem);
	};

	private readonly onMouseOut = (event: MouseEvent): void => {
		const sourceEl = event.target instanceof Element ? event.target : null;
		if (!sourceEl) {
			return;
		}
		const hoverAnchorEl = this.resolveHoverAnchorElement(sourceEl);
		if (!hoverAnchorEl) {
			return;
		}
		const relatedTarget = event.relatedTarget;
		if (relatedTarget instanceof Node) {
			if (hoverAnchorEl.contains(relatedTarget)) {
				return;
			}
			if (relatedTarget instanceof Element) {
				const relatedHoverAnchorEl = this.resolveHoverAnchorElement(relatedTarget);
				if (relatedHoverAnchorEl === hoverAnchorEl) {
					return;
				}
			}
			if (this.previewPopover.containsTarget(relatedTarget)) {
				this.clearHideTimer();
				return;
			}
		}
		this.scheduleHide();
	};

	private readonly onMouseDown = (event: MouseEvent): void => {
		const target = event.target;
		if (this.previewPopover.containsTarget(target)) {
			return;
		}
		this.hideImmediately();
	};

	private readonly onPopoverMouseEnter = (): void => {
		this.clearHideTimer();
	};

	private readonly onPopoverMouseLeave = (): void => {
		this.scheduleHide();
	};

	private scheduleShow(anchorEl: HTMLElement, previewItem: GuidebookKeywordPreviewItem): void {
		this.clearHideTimer();
		this.pendingAnchorEl = anchorEl;
		this.pendingPreviewItem = previewItem;
		if (this.pendingShowTimer !== null) {
			window.clearTimeout(this.pendingShowTimer);
		}
		this.pendingShowTimer = window.setTimeout(() => {
			this.pendingShowTimer = null;
			const currentSettings = this.getSettings();
			if (!currentSettings.guidebookPreviewMainHoverEnabled && !currentSettings.guidebookPreviewSidebarHoverEnabled) {
				return;
			}
			const currentAnchorEl = this.pendingAnchorEl;
			const currentPreviewItem = this.pendingPreviewItem;
			if (!currentAnchorEl || !currentPreviewItem || !currentAnchorEl.isConnected) {
				return;
			}
			this.previewPopover.show(currentPreviewItem, currentAnchorEl.getBoundingClientRect(), {
				width: currentSettings.guidebookPreviewWidth,
				maxLines: currentSettings.guidebookPreviewMaxLines,
			});
		}, PREVIEW_SHOW_DELAY);
	}

	private resolveHoverContext(
		targetEl: Element,
		settings: ChineseNovelAssistantSettings,
	): { anchorEl: HTMLElement; previewItem: GuidebookKeywordPreviewItem | null } | null {
		if (settings.guidebookPreviewMainHoverEnabled) {
			const keywordEl = targetEl.closest(`.${GUIDEBOOK_KEYWORD_HIT_CLASS}`);
			if (keywordEl instanceof HTMLElement) {
				const editorView = this.resolveEditorView(keywordEl);
				if (!editorView) {
					return null;
				}
				const keyword = keywordEl.textContent?.trim() ?? "";
				if (keyword.length === 0) {
					return {
						anchorEl: keywordEl,
						previewItem: null,
					};
				}
				return {
					anchorEl: keywordEl,
					previewItem: this.resolveKeywordPreviewItem(editorView, keyword),
				};
			}
		}

		if (settings.guidebookPreviewSidebarHoverEnabled) {
			const sidebarRowEl = targetEl.closest(`.${GUIDEBOOK_SIDEBAR_H2_ROW_CLASS}`);
			if (sidebarRowEl instanceof HTMLElement) {
				return {
					anchorEl: sidebarRowEl,
					previewItem: this.resolveSidebarPreviewItem(sidebarRowEl),
				};
			}
		}
		return null;
	}

	private resolveHoverAnchorElement(targetEl: Element): HTMLElement | null {
		const keywordEl = targetEl.closest(`.${GUIDEBOOK_KEYWORD_HIT_CLASS}`);
		if (keywordEl instanceof HTMLElement) {
			return keywordEl;
		}
		const sidebarRowEl = targetEl.closest(`.${GUIDEBOOK_SIDEBAR_H2_ROW_CLASS}`);
		return sidebarRowEl instanceof HTMLElement ? sidebarRowEl : null;
	}

	private resolveSidebarPreviewItem(sidebarRowEl: HTMLElement): GuidebookKeywordPreviewItem | null {
		const rawPayload = (sidebarRowEl as SidebarPreviewCarrierElement)[SIDEBAR_PREVIEW_ITEM_PROP];
		if (!rawPayload || typeof rawPayload !== "object") {
			return null;
		}
		const payload = rawPayload as Partial<GuidebookKeywordPreviewItem>;
		const keyword = typeof payload.keyword === "string" ? payload.keyword.trim() : "";
		const title = typeof payload.title === "string" ? payload.title : "";
		const categoryTitle = typeof payload.categoryTitle === "string" ? payload.categoryTitle : "";
		const content = typeof payload.content === "string" ? payload.content : "";
		const sourcePath = typeof payload.sourcePath === "string" ? payload.sourcePath : "";
		if (keyword.length === 0 || title.length === 0 || sourcePath.length === 0) {
			return null;
		}
		return {
			keyword,
			title,
			categoryTitle,
			content,
			sourcePath,
		};
	}

	private scheduleHide(): void {
		if (this.pendingShowTimer !== null) {
			window.clearTimeout(this.pendingShowTimer);
			this.pendingShowTimer = null;
		}
		if (this.pendingHideTimer !== null) {
			return;
		}
		this.pendingHideTimer = window.setTimeout(() => {
			this.pendingHideTimer = null;
			this.previewPopover.hide();
		}, PREVIEW_HIDE_DELAY);
	}

	private hideImmediately(): void {
		this.clearTimers();
		this.previewPopover.hide();
	}

	private clearTimers(): void {
		if (this.pendingShowTimer !== null) {
			window.clearTimeout(this.pendingShowTimer);
			this.pendingShowTimer = null;
		}
		this.clearHideTimer();
		this.pendingAnchorEl = null;
		this.pendingPreviewItem = null;
	}

	private clearHideTimer(): void {
		if (this.pendingHideTimer !== null) {
			window.clearTimeout(this.pendingHideTimer);
			this.pendingHideTimer = null;
		}
	}

	private resolveEditorView(keywordEl: HTMLElement): ReturnType<typeof EditorView.findFromDOM> {
		const editorEl = keywordEl.closest(".cm-editor");
		if (!(editorEl instanceof HTMLElement)) {
			return null;
		}
		return EditorView.findFromDOM(editorEl);
	}

	private async searchKeywordInGlobalSearch(keyword: string): Promise<void> {
		const normalizedKeyword = keyword.trim();
		if (normalizedKeyword.length === 0) {
			return;
		}
		const workspace = this.plugin.app.workspace;
		let searchLeaf = workspace.getLeavesOfType("search")[0] ?? null;
		if (!searchLeaf) {
			const workspaceAny = workspace as unknown as {
				getLeftLeaf?: (split: boolean) => typeof searchLeaf;
				getRightLeaf?: (split: boolean) => typeof searchLeaf;
			};
			searchLeaf = workspaceAny.getLeftLeaf?.(false) ?? workspaceAny.getRightLeaf?.(false) ?? null;
			if (!searchLeaf) {
				return;
			}
			await searchLeaf.setViewState({ type: "search", active: true });
		}

		workspace.setActiveLeaf(searchLeaf, {
			focus: true,
		});
		const searchView = searchLeaf.view as unknown as {
			setQuery?: (query: string) => void;
			searchComponent?: { setValue?: (query: string) => void; inputEl?: HTMLInputElement };
			onQueryChanged?: () => void;
			doSearch?: () => void;
			triggerSearch?: () => void;
			containerEl?: HTMLElement;
		};
		const searchLeafContainerEl = (searchLeaf as unknown as { containerEl?: HTMLElement }).containerEl;
		const searchInputEl =
			searchView.searchComponent?.inputEl ??
			searchLeafContainerEl?.querySelector<HTMLInputElement>(".search-input input") ??
			searchLeafContainerEl?.querySelector<HTMLInputElement>("input[type='search']") ??
			searchLeafContainerEl?.querySelector<HTMLInputElement>("input");
		if (typeof searchView.setQuery === "function") {
			searchView.setQuery(normalizedKeyword);
			this.triggerSearchExecution(searchInputEl, searchView);
			return;
		}
		if (searchView.searchComponent?.setValue) {
			searchView.searchComponent.setValue(normalizedKeyword);
			this.triggerSearchExecution(searchInputEl, searchView);
			return;
		}

		if (!searchInputEl) {
			return;
		}
		searchInputEl.value = normalizedKeyword;
		this.triggerSearchExecution(searchInputEl, searchView);
	}

	private async openSettingFileAtHeading(sourcePath: string, headingTitle: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}
		const targetPosition = await this.resolveH2HeadingPosition(file, headingTitle);
		await this.plugin.app.workspace.openLinkText(file.path, file.path, this.getSettings().openFileInNewTab);
		if (!targetPosition) {
			return;
		}

		const targetView = this.resolveOpenedMarkdownView(file.path);
		if (!targetView) {
			return;
		}
		const editorAny = targetView.editor as unknown as {
			setCursor?: (line: number, ch: number) => void;
			scrollIntoView?: (position: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean) => void;
		};
		editorAny.setCursor?.(targetPosition.line, targetPosition.ch);
		editorAny.scrollIntoView?.(
			{
				from: { line: targetPosition.line, ch: targetPosition.ch },
				to: { line: targetPosition.line, ch: targetPosition.ch },
			},
			true,
		);
	}

	private resolveOpenedMarkdownView(filePath: string): MarkdownView | null {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView?.file?.path === filePath) {
			return activeView;
		}
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
				return leaf.view;
			}
		}
		return null;
	}

	private async resolveH2HeadingPosition(file: TFile, headingTitle: string): Promise<{ line: number; ch: number } | null> {
		const normalizedTitle = headingTitle.trim();
		if (normalizedTitle.length === 0) {
			return null;
		}
		const content = await this.plugin.app.vault.cachedRead(file);
		const lines = content.split(/\r?\n/);
		for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
			const lineText = lines[lineIndex] ?? "";
			const parsedTitle = parseH2HeadingTitle(lineText);
			if (parsedTitle && parsedTitle === normalizedTitle) {
				return {
					line: lineIndex,
					ch: lineText.length,
				};
			}
		}
		return null;
	}

	private triggerSearchExecution(
		inputEl: HTMLInputElement | null | undefined,
		searchView: {
			onQueryChanged?: () => void;
			doSearch?: () => void;
			triggerSearch?: () => void;
		},
	): void {
		searchView.onQueryChanged?.();
		searchView.doSearch?.();
		searchView.triggerSearch?.();
		if (!inputEl) {
			return;
		}
		inputEl.focus();
		inputEl.dispatchEvent(new Event("input", { bubbles: true }));
		inputEl.dispatchEvent(new Event("change", { bubbles: true }));
		inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
		inputEl.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
	}
}

function parseH2HeadingTitle(line: string): string | null {
	const match = line.match(/^\s{0,3}(#{2})[ \t]+(.*)$/);
	if (!match || !match[1]) {
		return null;
	}
	let title = (match[2] ?? "").trim();
	title = title.replace(/[ \t]+#+[ \t]*$/, "").trim();
	return title.length > 0 ? title : null;
}
