import type { EditorView } from "@codemirror/view";
import { Editor, MarkdownFileInfo, MarkdownView, Menu, MenuItem, setIcon, type Plugin } from "obsidian";
import { UI } from "../../constants";
import type { TranslationKey } from "../../lang";
import type { SettingDatas } from "../../core/setting-datas";
import { resolveEditorViewFromMarkdownView } from "../../utils/markdown-editor-view";
import { appendGuidebookSettingToCategoryByPath } from "./menu-actions";
import { buildGuidebookTreeData, type GuidebookTreeData } from "./tree-builder";

interface TextMenuControllerOptions {
	getSettings: () => SettingDatas;
	t: (key: TranslationKey) => string;
	isGuidebookKeywordInEditor: (editorView: EditorView, keyword: string) => boolean;
}

interface AddSettingCollectionItem {
	title: string;
	categories: AddSettingCategoryItem[];
}

interface AddSettingCategoryItem {
	title: string;
	sourcePath: string;
	h1IndexInSource: number;
}

interface MenuItemWithSubmenu {
	setSubmenu?: (...args: unknown[]) => unknown;
	submenu?: Menu;
}

const MENU_REFRESH_DELAY = 120;

export class TextMenuGuidebookController {
	private readonly plugin: Plugin;
	private readonly getSettings: () => SettingDatas;
	private readonly t: (key: TranslationKey) => string;
	private readonly isGuidebookKeywordInEditor: (editorView: EditorView, keyword: string) => boolean;
	private cachedTreeData: GuidebookTreeData | null = null;
	private categoryPanelEl: HTMLElement | null = null;
	private categoryPanelContentKey: string | null = null;
	private categoryPanelZIndex: number | null = null;
	private activeEditorContextMenu: Menu | null = null;
	private activeAddSettingLevel1Menu: Menu | null = null;
	private refreshTimer: number | null = null;
	private categoryPanelHideTimer: number | null = null;
	private refreshToken = 0;
	private started = false;

	constructor(
		plugin: Plugin,
		options: TextMenuControllerOptions,
	) {
		this.plugin = plugin;
		this.getSettings = options.getSettings;
		this.t = options.t;
		this.isGuidebookKeywordInEditor = options.isGuidebookKeywordInEditor;
	}

	start(): void {
		if (this.started) {
			return;
		}
		this.started = true;
		this.plugin.registerEvent(this.plugin.app.workspace.on("editor-menu", this.onEditorMenu));
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", (file) => {
				this.scheduleTreeRefresh(file?.path ?? null);
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
				const view = leaf?.view;
				if (view instanceof MarkdownView) {
					this.scheduleTreeRefresh(view.file?.path ?? null);
				}
			}),
		);
		this.plugin.registerDomEvent(document, "mousedown", this.onDocumentMouseDown);
		this.scheduleTreeRefresh(this.resolveActiveFilePath());
	}

	handleSettingsChange(): void {
		this.scheduleTreeRefresh(this.resolveActiveFilePath());
	}

	handleVaultChange(): void {
		this.scheduleTreeRefresh(this.resolveActiveFilePath());
	}

	dispose(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.clearCategoryPanelHideTimer();
		if (this.categoryPanelEl) {
			this.categoryPanelEl.remove();
			this.categoryPanelEl = null;
		}
	}

	private readonly onEditorMenu = (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void => {
		this.activeEditorContextMenu = menu;
		const selectedText = normalizeSelection(editor.getSelection() ?? "");
		if (selectedText.length === 0) {
			return;
		}

		const markdownView = info instanceof MarkdownView ? info : null;
		const editorView = markdownView ? resolveEditorViewFromMarkdownView(markdownView) : null;
		if (editorView && this.isGuidebookKeywordInEditor(editorView, selectedText)) {
			return;
		}

		const collectionItems = this.buildAddSettingCollectionItems();
		menu.onHide(() => {
			if (this.activeEditorContextMenu === menu) {
				this.activeEditorContextMenu = null;
			}
			this.activeAddSettingLevel1Menu = null;
			this.categoryPanelZIndex = null;
			this.categoryPanelContentKey = null;
			this.hideCategoryPanelImmediate();
		});
		menu.addItem((item) => {
			item
				.setTitle(this.t("feature.editor_menu.add_setting"))
				.setIcon(UI.icon.addToGuidebook);
			if (collectionItems.length === 0) {
				item.setDisabled(true);
				return;
			}

			if (this.attachSubmenuByBuilder(item, (submenu) => {
				this.fillCollectionSubmenu(submenu, collectionItems, selectedText);
			}, (submenu) => {
				this.activeAddSettingLevel1Menu = submenu;
			})) {
				return;
			}
			const collectionSubmenu = this.createCollectionSubmenu(collectionItems, selectedText);
			this.activeAddSettingLevel1Menu = collectionSubmenu;
			item.onClick((evt) => {
				if (evt instanceof MouseEvent) {
					collectionSubmenu.showAtMouseEvent(evt);
				}
			});
		});
	};

	private buildAddSettingCollectionItems(): AddSettingCollectionItem[] {
		const treeData = this.cachedTreeData;
		if (!treeData) {
			return [];
		}
		const collections: AddSettingCollectionItem[] = [];
		for (const fileNode of treeData.files) {
			const categories: AddSettingCategoryItem[] = [];
			for (const h1Node of fileNode.h1List) {
				const title = h1Node.title.trim();
				if (title.length === 0) {
					continue;
				}
				categories.push({
					title,
					sourcePath: h1Node.sourcePath,
					h1IndexInSource: h1Node.h1IndexInSource,
				});
			}
			if (categories.length === 0) {
				continue;
			}
			collections.push({
				title: fileNode.fileName,
				categories,
			});
		}
		return collections;
	}

	private createCollectionSubmenu(
		collectionItems: AddSettingCollectionItem[],
		selectedText: string,
	): Menu {
		const submenu = new Menu();
		for (const collectionItem of collectionItems) {
			submenu.addItem((item) => {
				item.setTitle(collectionItem.title).setIcon(UI.icon.file);
				this.bindCollectionItemInteractions(item, collectionItem.categories, selectedText);
			});
		}
		return submenu;
	}

	private fillCollectionSubmenu(
		submenu: Menu,
		collectionItems: AddSettingCollectionItem[],
		selectedText: string,
	): void {
		for (const collectionItem of collectionItems) {
			submenu.addItem((item) => {
				item.setTitle(collectionItem.title).setIcon(UI.icon.file);
				this.bindCollectionItemInteractions(item, collectionItem.categories, selectedText);
			});
		}
	}

	private attachSubmenu(item: MenuItem, submenu: Menu): boolean {
		const menuItemAny = item as unknown as MenuItemWithSubmenu;
		if (typeof menuItemAny.setSubmenu !== "function") {
			return false;
		}
		try {
			menuItemAny.setSubmenu(submenu);
			return true;
		} catch {
			return false;
		}
	}

	private attachSubmenuByBuilder(
		item: MenuItem,
		builder: (submenu: Menu) => void,
		onResolvedSubmenu?: (submenu: Menu) => void,
	): boolean {
		const menuItemAny = item as unknown as MenuItemWithSubmenu;
		if (typeof menuItemAny.setSubmenu !== "function") {
			return false;
		}
		try {
			menuItemAny.setSubmenu();
			if (menuItemAny.submenu) {
				builder(menuItemAny.submenu);
				onResolvedSubmenu?.(menuItemAny.submenu);
				return true;
			}
		} catch {
			// Fall through and try legacy signature.
		}
		const legacySubmenu = new Menu();
		builder(legacySubmenu);
		onResolvedSubmenu?.(legacySubmenu);
		return this.attachSubmenu(item, legacySubmenu);
	}

	private bindCollectionItemInteractions(
		item: MenuItem,
		categories: AddSettingCategoryItem[],
		selectedText: string,
	): void {
		const menuItemAny = item as unknown as {
			dom?: HTMLElement;
			domEl?: HTMLElement;
		};
		window.setTimeout(() => {
			const menuItemEl = this.resolveMenuItemContainerEl(menuItemAny.domEl ?? menuItemAny.dom);
			if (!(menuItemEl instanceof HTMLElement)) {
				return;
			}
			menuItemEl.classList.add("cna-text-menu-has-children");
			const panelContentKey = this.buildCategoryPanelKey(categories, selectedText);
			const showPanel = (): void => {
				this.showCategoryPanel(menuItemEl, categories, selectedText, panelContentKey);
			};
			menuItemEl.addEventListener("mouseenter", showPanel);
			menuItemEl.addEventListener("mouseleave", () => {
				this.scheduleHideCategoryPanel();
			});
			menuItemEl.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				showPanel();
			});
		}, 0);
	}

	private readonly onDocumentMouseDown = (event: MouseEvent): void => {
		const target = event.target;
		if (target instanceof Node && this.categoryPanelEl?.contains(target)) {
			return;
		}
		this.hideCategoryPanelImmediate();
	};

	private showCategoryPanel(
		anchorEl: HTMLElement,
		categories: AddSettingCategoryItem[],
		selectedText: string,
		panelContentKey: string,
	): void {
		const panelEl = this.ensureCategoryPanelEl();
		this.clearCategoryPanelHideTimer();
		if (panelContentKey !== this.categoryPanelContentKey || panelEl.childElementCount === 0) {
			panelEl.empty();
			this.renderCategoryPanelItems(panelEl, categories, selectedText);
			this.categoryPanelContentKey = panelContentKey;
		} else {
			this.clearCategoryPanelActiveState(panelEl);
		}
		this.elevateCategoryPanelAboveMenus(panelEl);

		panelEl.toggleClass("is-positioning", true);
		panelEl.show();
		const anchorRect = anchorEl.getBoundingClientRect();
		const panelRect = panelEl.getBoundingClientRect();
		const gap = 6;
		let left = anchorRect.right + gap;
		if (left + panelRect.width > window.innerWidth - 8) {
			left = anchorRect.left - panelRect.width - gap;
		}
		left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
		let top = anchorRect.top;
		if (top + panelRect.height > window.innerHeight - 8) {
			top = window.innerHeight - panelRect.height - 8;
		}
		top = Math.max(8, top);
		panelEl.setCssProps({
			left: `${Math.round(left)}px`,
			top: `${Math.round(top)}px`,
		});
		panelEl.toggleClass("is-positioning", false);
	}

	private renderCategoryPanelItems(
		panelEl: HTMLElement,
		categories: AddSettingCategoryItem[],
		selectedText: string,
	): void {
		for (const category of categories) {
			const itemEl = panelEl.createDiv({ cls: "menu-item" });
			const iconEl = itemEl.createDiv({ cls: "menu-item-icon" });
			setIcon(iconEl, UI.icon.h1);
			itemEl.createDiv({ cls: "menu-item-title", text: category.title });
			itemEl.addEventListener("mouseenter", () => {
				this.setCategoryPanelActiveItem(itemEl);
			});
			itemEl.addEventListener("mousedown", (event) => {
				if (event.button !== 0) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				this.setCategoryPanelActiveItem(itemEl);
				void this.appendSettingToCategory(category, selectedText);
				this.hideCategoryPanelImmediate();
			});
		}
	}

	private elevateCategoryPanelAboveMenus(panelEl: HTMLElement): void {
		if (this.categoryPanelZIndex === null) {
			// Keep the custom level-2 panel above any native/DOM menu layers.
			let maxMenuZIndex = 0;
			for (const menuEl of Array.from(document.querySelectorAll<HTMLElement>(".menu"))) {
				if (menuEl === panelEl) {
					continue;
				}
				const zIndexRaw = window.getComputedStyle(menuEl).zIndex;
				const zIndex = Number.parseInt(zIndexRaw, 10);
				if (Number.isFinite(zIndex)) {
					maxMenuZIndex = Math.max(maxMenuZIndex, zIndex);
				}
			}

			const layerMenuRaw = window.getComputedStyle(document.body).getPropertyValue("--layer-menu");
			const layerMenu = Number.parseInt(layerMenuRaw, 10);
			const baseZIndex = Number.isFinite(layerMenu) ? layerMenu : 1000;
			this.categoryPanelZIndex = Math.max(baseZIndex, maxMenuZIndex + 1);
		}

		panelEl.style.zIndex = String(this.categoryPanelZIndex);
		if (panelEl.parentElement !== document.body || panelEl.nextElementSibling !== null) {
			document.body.appendChild(panelEl);
		}
	}

	private ensureCategoryPanelEl(): HTMLElement {
		if (this.categoryPanelEl && this.categoryPanelEl.isConnected) {
			return this.categoryPanelEl;
		}
		const panelEl = document.body.createDiv({ cls: "menu cna-text-menu-category-panel" });
		panelEl.hide();
		panelEl.addEventListener("mouseenter", () => {
			this.clearCategoryPanelHideTimer();
		});
		panelEl.addEventListener("mouseleave", () => {
			this.scheduleHideCategoryPanel();
		});
		this.categoryPanelEl = panelEl;
		return panelEl;
	}

	private resolveMenuItemContainerEl(candidate: HTMLElement | undefined): HTMLElement | null {
		if (!(candidate instanceof HTMLElement)) {
			return null;
		}
		if (candidate.classList.contains("menu-item")) {
			return candidate;
		}
		const closestMenuItem = candidate.closest(".menu-item");
		return closestMenuItem instanceof HTMLElement ? closestMenuItem : candidate;
	}

	private setCategoryPanelActiveItem(activeItemEl: HTMLElement): void {
		const panelEl = this.categoryPanelEl;
		if (!panelEl) {
			return;
		}
		for (const itemEl of Array.from(panelEl.querySelectorAll<HTMLElement>(".menu-item"))) {
			itemEl.classList.toggle("cna-text-menu-item-active", itemEl === activeItemEl);
		}
	}

	private clearCategoryPanelActiveState(panelEl: HTMLElement): void {
		for (const itemEl of Array.from(panelEl.querySelectorAll<HTMLElement>(".menu-item"))) {
			itemEl.classList.remove("cna-text-menu-item-active");
		}
	}

	private scheduleHideCategoryPanel(): void {
		if (this.categoryPanelHideTimer !== null) {
			return;
		}
		this.categoryPanelHideTimer = window.setTimeout(() => {
			this.categoryPanelHideTimer = null;
			this.hideCategoryPanelImmediate();
		}, 140);
	}

	private clearCategoryPanelHideTimer(): void {
		if (this.categoryPanelHideTimer !== null) {
			window.clearTimeout(this.categoryPanelHideTimer);
			this.categoryPanelHideTimer = null;
		}
	}

	private hideCategoryPanelImmediate(): void {
		this.clearCategoryPanelHideTimer();
		if (!this.categoryPanelEl) {
			return;
		}
		this.categoryPanelEl.hide();
	}

	private async appendSettingToCategory(category: AddSettingCategoryItem, selectedText: string): Promise<void> {
		const normalizedText = normalizeSelection(selectedText);
		if (normalizedText.length === 0) {
			return;
		}
		const appendSucceeded = await appendGuidebookSettingToCategoryByPath(
			{
				app: this.plugin.app,
				t: this.t,
				treeData: this.cachedTreeData,
			},
			category.sourcePath,
			category.h1IndexInSource,
			normalizedText,
			category.title,
		);
		if (!appendSucceeded) {
			return;
		}
		this.closeAddSettingMenus();
		this.scheduleTreeRefresh(this.resolveActiveFilePath());
	}

	private closeAddSettingMenus(): void {
		this.hideCategoryPanelImmediate();
		this.activeAddSettingLevel1Menu?.hide();
		this.activeEditorContextMenu?.hide();
		this.activeAddSettingLevel1Menu = null;
		this.activeEditorContextMenu = null;
		this.categoryPanelZIndex = null;
		this.categoryPanelContentKey = null;
		// Fallback for environments where hide() does not close all nested layers immediately.
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
		document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
	}

	private scheduleTreeRefresh(filePath: string | null): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refreshTreeData(filePath);
		}, MENU_REFRESH_DELAY);
	}

	private async refreshTreeData(filePath: string | null): Promise<void> {
		const token = ++this.refreshToken;
		if (!filePath) {
			if (token === this.refreshToken) {
				this.cachedTreeData = null;
			}
			return;
		}
		const treeData = await buildGuidebookTreeData(this.plugin.app, this.getSettings(), filePath);
		if (token !== this.refreshToken) {
			return;
		}
		this.cachedTreeData = treeData;
	}

	private resolveActiveFilePath(): string | null {
		return this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? null;
	}

	private buildCategoryPanelKey(categories: AddSettingCategoryItem[], selectedText: string): string {
		const categoryKey = categories
			.map((category) => `${category.sourcePath}\u0000${category.h1IndexInSource}\u0000${category.title}`)
			.join("\u0001");
		return `${selectedText}\u0002${categoryKey}`;
	}
}

function normalizeSelection(value: string): string {
	const normalized = value.trim();
	if (normalized.length === 0) {
		return "";
	}
	if (/[\r\n]/.test(normalized)) {
		return "";
	}
	return normalized;
}


