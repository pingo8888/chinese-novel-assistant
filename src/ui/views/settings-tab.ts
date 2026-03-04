import { App, Plugin, PluginSettingTab } from "obsidian";
import type { PluginContext } from "../../core/context";
import { ClearableInputComponent } from "../componets/clearable-input";
import { TabsComponent, type TabDefinition } from "../componets/tabs";
import {
	type SettingsTabRenderContext,
	renderGlobalSettings,
	renderGuidebookSettings,
	renderNoteSettings,
	renderOtherSettings,
	renderProofreadSettings,
	renderSnippetSettings,
	renderTypesetSettings,
} from "./settings-tabs";

export class ChineseNovelAssistantSettingTab extends PluginSettingTab {
	private ctx: PluginContext;
	private activeTabId = "general";
	private searchKeyword = "";

	constructor(app: App, plugin: Plugin, ctx: PluginContext) {
		super(app, plugin);
		this.ctx = ctx;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const searchWrapEl = containerEl.createDiv({ cls: "cna-settings-search-wrap" });

		const tabs = this.createTabDefinitions();
		const tabsContainer = containerEl.createDiv();
		let isSearchMode = this.searchKeyword.trim().length > 0;
		const renderContent = () => {
			tabsContainer.empty();
			if (isSearchMode) {
				this.renderSearchMode(tabsContainer, tabs);
				return;
			}

			new TabsComponent({
				containerEl: tabsContainer,
				defaultTabId: this.activeTabId,
				onTabChange: (tabId) => {
					this.activeTabId = tabId;
				},
				tabs,
			});
		};
		renderContent();

		new ClearableInputComponent({
			containerEl: searchWrapEl,
			containerClassName: "cna-settings-search-input-container",
			placeholder: this.ctx.t("settings.search.placeholder"),
			clearAriaLabel: this.ctx.t("settings.search.clear"),
			initialValue: this.searchKeyword,
			onChange: (value) => {
				const wasSearchMode = isSearchMode;
				this.searchKeyword = value;
				isSearchMode = this.searchKeyword.trim().length > 0;
				if (wasSearchMode !== isSearchMode) {
					renderContent();
				}

				this.applySettingsSearch(tabsContainer, this.searchKeyword, isSearchMode);
			},
		});

		this.applySettingsSearch(tabsContainer, this.searchKeyword, isSearchMode);
	}

	private createTabDefinitions(): TabDefinition[] {
		const renderContext: SettingsTabRenderContext = {
			app: this.app,
			ctx: this.ctx,
			refresh: () => this.display(),
		};

		return [
			{
				id: "general",
				label: this.ctx.t("settings.tab.global"),
				render: (panelEl) => renderGlobalSettings(panelEl, renderContext),
			},
			{
				id: "guidebook",
				label: this.ctx.t("settings.tab.setting"),
				render: (panelEl) => renderGuidebookSettings(panelEl, renderContext),
			},
			{
				id: "note",
				label: this.ctx.t("settings.tab.sticky_note"),
				render: (panelEl) => renderNoteSettings(panelEl, renderContext),
			},
			{
				id: "proofread",
				label: this.ctx.t("settings.tab.proofread"),
				render: (panelEl) => renderProofreadSettings(panelEl, renderContext),
			},
			{
				id: "snippet",
				label: this.ctx.t("settings.tab.snippet"),
				render: (panelEl) => renderSnippetSettings(panelEl, renderContext),
			},
			{
				id: "typeset",
				label: this.ctx.t("settings.tab.typeset"),
				render: (panelEl) => renderTypesetSettings(panelEl, renderContext),
			},
			{
				id: "other",
				label: this.ctx.t("settings.tab.other"),
				render: (panelEl) => renderOtherSettings(panelEl, renderContext),
			},
		];
	}

	private renderSearchMode(containerEl: HTMLElement, tabs: TabDefinition[]): void {
		const tabsRootEl = containerEl.createDiv({ cls: "cna-tabs" });
		const tabListEl = tabsRootEl.createDiv({ cls: "cna-tab-list cna-tab-list--search" });
		for (const tab of tabs) {
			const buttonEl = tabListEl.createEl("button", {
				text: tab.label,
				cls: "cna-tab-button",
			});
			buttonEl.type = "button";
			buttonEl.setAttr("aria-selected", "false");
			buttonEl.setAttr("tabindex", "-1");
		}

		const panelEl = tabsRootEl.createDiv({ cls: "cna-tab-panel cna-tab-panel--search" });
		for (const tab of tabs) {
			const sectionEl = panelEl.createDiv({ cls: "cna-search-tab-section" });
			tab.render(sectionEl);
		}
	}

	private applySettingsSearch(tabsContainer: HTMLElement, keyword: string, isSearchMode: boolean): void {
		const tabPanelEl = tabsContainer.querySelector<HTMLElement>(".cna-tab-panel");
		if (!tabPanelEl) {
			return;
		}

		const normalizedKeyword = keyword.trim().toLowerCase();
		const isEmptyKeyword = normalizedKeyword.length === 0;
		const settingItems = Array.from(tabPanelEl.querySelectorAll<HTMLElement>(".cna-settings-item.setting-item"));
		let hasAnyVisibleSettingItem = false;
		for (const item of settingItems) {
			const text = item.textContent?.toLowerCase() ?? "";
			const isVisible = isEmptyKeyword || text.includes(normalizedKeyword);
			item.style.display = isVisible ? "" : "none";
			if (isVisible) {
				hasAnyVisibleSettingItem = true;
			}
		}

		const settingsPanels = Array.from(tabPanelEl.querySelectorAll<HTMLElement>(".cna-settings-panel"));
		for (const panel of settingsPanels) {
			this.syncSectionTitleVisibility(panel, isEmptyKeyword);
			this.normalizeSearchPanelLeadingSpace(panel, isSearchMode && !isEmptyKeyword);
		}

		if (!isSearchMode) {
			this.syncSearchEmptyState(tabPanelEl, false);
			return;
		}

		const searchTabSections = Array.from(tabPanelEl.querySelectorAll<HTMLElement>(".cna-search-tab-section"));
		for (const section of searchTabSections) {
			const hasVisibleSettingItem = Array.from(section.querySelectorAll<HTMLElement>(".cna-settings-item.setting-item")).some(
				(item) => item.style.display !== "none",
			);
			section.style.display = isEmptyKeyword || hasVisibleSettingItem ? "" : "none";
		}

		this.syncSearchEmptyState(tabPanelEl, !isEmptyKeyword && !hasAnyVisibleSettingItem);
	}

	private syncSectionTitleVisibility(panelEl: HTMLElement, isEmptyKeyword: boolean): void {
		const children = Array.from(panelEl.children) as HTMLElement[];
		for (let i = 0; i < children.length; i += 1) {
			const node = children[i];
			if (!node) {
				continue;
			}

			if (!node.classList.contains("cna-settings-section-title")) {
				continue;
			}

			if (isEmptyKeyword) {
				node.style.display = "";
				continue;
			}

			let hasVisibleSettingItem = false;
			for (let j = i + 1; j < children.length; j += 1) {
				const nextNode = children[j];
				if (!nextNode) {
					continue;
				}

				if (nextNode.classList.contains("cna-settings-section-title")) {
					break;
				}

				if (nextNode.classList.contains("setting-item") && nextNode.style.display !== "none") {
					hasVisibleSettingItem = true;
					break;
				}
			}

			node.style.display = hasVisibleSettingItem ? "" : "none";
		}
	}

	private normalizeSearchPanelLeadingSpace(panelEl: HTMLElement, enable: boolean): void {
		const children = Array.from(panelEl.children) as HTMLElement[];
		for (const child of children) {
			if (!child) {
				continue;
			}

			if (child.classList.contains("cna-settings-section-title")) {
				child.style.marginTop = "";
			}
		}

		if (!enable) {
			return;
		}

		const firstVisibleNode = children.find((child) => child && child.style.display !== "none");
		if (firstVisibleNode && firstVisibleNode.classList.contains("cna-settings-section-title")) {
			firstVisibleNode.style.marginTop = "0px";
		}
	}

	private syncSearchEmptyState(tabPanelEl: HTMLElement, shouldShow: boolean): void {
		const className = "cna-search-empty-state";
		const current = tabPanelEl.querySelector<HTMLElement>(`.${className}`);
		if (!shouldShow) {
			current?.remove();
			return;
		}

		if (current) {
			current.setText(this.ctx.t("settings.search.no_results"));
			return;
		}

		tabPanelEl.createDiv({
			cls: className,
			text: this.ctx.t("settings.search.no_results"),
		});
	}
}

