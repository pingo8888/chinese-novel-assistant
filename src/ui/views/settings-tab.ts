import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { SupportedLocale } from "../../lang";
import type { PluginContext } from "../../core/context";
import { TabsComponent, type TabDefinition } from "../componets/tabs";

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
		const searchInputContainerEl = searchWrapEl.createDiv({
			cls: "search-input-container cna-settings-search-input-container",
		});
		const searchInputEl = searchInputContainerEl.createEl("input", {
			type: "search",
			attr: {
				placeholder: this.ctx.t("settings.search.placeholder"),
			},
		});
		const clearButtonEl = searchInputContainerEl.createDiv({
			cls: "search-input-clear-button",
			attr: {
				"aria-label": this.ctx.t("settings.search.clear"),
			},
		});
		searchInputEl.value = this.searchKeyword;
		this.syncSearchClearButton(clearButtonEl, this.searchKeyword);

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

		const handleSearchInput = () => {
			const wasSearchMode = isSearchMode;
			this.searchKeyword = searchInputEl.value;
			this.syncSearchClearButton(clearButtonEl, this.searchKeyword);
			isSearchMode = this.searchKeyword.trim().length > 0;
			if (wasSearchMode !== isSearchMode) {
				renderContent();
			}

			this.applySettingsSearch(tabsContainer, this.searchKeyword, isSearchMode);
		};

		let isComposing = false;
		searchInputEl.addEventListener("compositionstart", () => {
			isComposing = true;
		});
		searchInputEl.addEventListener("compositionend", () => {
			isComposing = false;
			handleSearchInput();
		});
		searchInputEl.addEventListener("input", () => {
			if (isComposing) {
				return;
			}
			handleSearchInput();
		});
		clearButtonEl.addEventListener("click", () => {
			if (searchInputEl.value.length === 0) {
				return;
			}

			searchInputEl.value = "";
			searchInputEl.dispatchEvent(new Event("input"));
			searchInputEl.focus();
		});

		this.applySettingsSearch(tabsContainer, this.searchKeyword, isSearchMode);
	}

	private syncSearchClearButton(clearButtonEl: HTMLElement, value: string): void {
		clearButtonEl.toggleClass("is-visible", value.length > 0);
	}

	private createTabDefinitions(): TabDefinition[] {
		return [
			{
				id: "general",
				label: this.ctx.t("settings.tab.global"),
				render: (panelEl) => this.renderGlobalSettings(panelEl),
			},
			{
				id: "guidebook",
				label: this.ctx.t("settings.tab.setting"),
				render: (panelEl) => this.renderSettingSettings(panelEl),
			},
			{
				id: "note",
				label: this.ctx.t("settings.tab.sticky_note"),
				render: (panelEl) => this.renderNoteSettings(panelEl),
			},
			{
				id: "proofread",
				label: this.ctx.t("settings.tab.proofread"),
				render: (panelEl) => this.renderProofreadSettings(panelEl),
			},
			{
				id: "snippet",
				label: this.ctx.t("settings.tab.snippet"),
				render: (panelEl) => this.renderSnippetSettings(panelEl),
			},
			{
				id: "typeset",
				label: this.ctx.t("settings.tab.typeset"),
				render: (panelEl) => this.renderTypesetSettings(panelEl),
			},
			{
				id: "other",
				label: this.ctx.t("settings.tab.other"),
				render: (panelEl) => this.renderOtherSettings(panelEl),
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

	private renderGlobalSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.global.section.novel_library"),
		});

		let pendingValue = "";
		new Setting(panelEl)
			.setName(this.ctx.t("settings.global.novel_library.add.name"))
			.setClass("cna-settings-item")
			.addText((text) => {
				text.setPlaceholder(this.ctx.t("settings.global.novel_library.add.placeholder"));
				text.onChange((value) => {
					pendingValue = value;
				});
			})
			.addButton((button) =>
				button
					.setButtonText(this.ctx.t("settings.common.add"))
					.setCta()
					.onClick(async () => {
						const next = pendingValue.trim();
						if (!next) {
							return;
						}

						if (this.ctx.settings.novelLibraries.includes(next)) {
							return;
						}

						await this.ctx.setSettings({
							novelLibraries: [...this.ctx.settings.novelLibraries, next],
						});
						this.display();
					}),
			);

		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.global.section.custom_subdir"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.global.subdir.enable.name"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.customDirNamesEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ customDirNamesEnabled: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.global.subdir.guidebook.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.customDirNamesEnabled)
			.addText((text) =>
				text
					.setValue(this.ctx.settings.guidebookDirName)
					.setDisabled(!this.ctx.settings.customDirNamesEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ guidebookDirName: value.trim() });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.global.subdir.note.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.customDirNamesEnabled)
			.addText((text) =>
				text
					.setValue(this.ctx.settings.noteDirName)
					.setDisabled(!this.ctx.settings.customDirNamesEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ noteDirName: value.trim() });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.global.subdir.snippet.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.customDirNamesEnabled)
			.addText((text) =>
				text
					.setValue(this.ctx.settings.snippetDirName)
					.setDisabled(!this.ctx.settings.customDirNamesEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ snippetDirName: value.trim() });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.global.subdir.proofread.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.customDirNamesEnabled)
			.addText((text) =>
				text
					.setValue(this.ctx.settings.proofreadDictionaryDirName)
					.setDisabled(!this.ctx.settings.customDirNamesEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadDictionaryDirName: value.trim() });
					}),
			);
	}

	private renderOtherSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.other.section.common"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.language.name"))
			.setDesc(this.ctx.t("settings.language.desc"))
			.setClass("cna-settings-item")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("zh_cn", this.ctx.t("settings.language.option.zh_cn"))
					.addOption("zh_tw", this.ctx.t("settings.language.option.zh_tw"))
					.setValue(this.ctx.locale)
					.onChange(async (value) => {
						if (!isSupportedLocale(value)) {
							return;
						}

						await this.ctx.setSettings({ locale: value });
						this.display();
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.other.open_file_in_new_tab.name"))
			.setDesc(this.ctx.t("settings.other.open_file_in_new_tab.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.openFileInNewTab).onChange(async (value) => {
					await this.ctx.setSettings({ openFileInNewTab: value });
				}),
			);

		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.other.section.word_count"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.other.enable_character_count.name"))
			.setDesc(this.ctx.t("settings.other.enable_character_count.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.enableCharacterCount).onChange(async (value) => {
					await this.ctx.setSettings({ enableCharacterCount: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.other.count_only_novel_library.name"))
			.setDesc(this.ctx.t("settings.other.count_only_novel_library.desc"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.enableCharacterCount)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.countOnlyNovelLibrary)
					.setDisabled(!this.ctx.settings.enableCharacterCount)
					.onChange(async (value) => {
						await this.ctx.setSettings({ countOnlyNovelLibrary: value });
					}),
			);
	}

	private renderSettingSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.config.section.keyword_highlight"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.mode.name"))
			.setDesc(this.ctx.t("settings.config.keyword.mode.desc"))
			.setClass("cna-settings-item")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("first", this.ctx.t("settings.config.keyword.mode.option.first"))
					.addOption("all", this.ctx.t("settings.config.keyword.mode.option.all"))
					.setValue(this.ctx.settings.keywordHighlightMode)
					.onChange(async (value) => {
						if (!isKeywordHighlightMode(value)) {
							return;
						}
						await this.ctx.setSettings({ keywordHighlightMode: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.background.name"))
			.setDesc(this.ctx.t("settings.config.keyword.background.desc"))
			.setClass("cna-settings-item")
			.addText((text) =>
				text
					.setValue(this.ctx.settings.keywordHighlightBackgroundColor)
					.onChange(async (value) => {
						await this.ctx.setSettings({ keywordHighlightBackgroundColor: value.trim() });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.underline_style.name"))
			.setDesc(this.ctx.t("settings.config.keyword.underline_style.desc"))
			.setClass("cna-settings-item")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", this.ctx.t("settings.config.keyword.underline_style.option.none"))
					.addOption("solid", this.ctx.t("settings.config.keyword.underline_style.option.solid"))
					.addOption("dashed", this.ctx.t("settings.config.keyword.underline_style.option.dashed"))
					.addOption("dotted", this.ctx.t("settings.config.keyword.underline_style.option.dotted"))
					.addOption("double", this.ctx.t("settings.config.keyword.underline_style.option.double"))
					.addOption("wavy", this.ctx.t("settings.config.keyword.underline_style.option.wavy"))
					.setValue(this.ctx.settings.keywordUnderlineStyle)
					.onChange(async (value) => {
						if (!isKeywordUnderlineStyle(value)) {
							return;
						}
						await this.ctx.setSettings({ keywordUnderlineStyle: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.underline_width.name"))
			.setDesc(this.ctx.t("settings.config.keyword.underline_width.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(0, 10, 1)
					.setValue(this.ctx.settings.keywordUnderlineWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.ctx.setSettings({ keywordUnderlineWidth: Math.round(value) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.underline_color.name"))
			.setDesc(this.ctx.t("settings.config.keyword.underline_color.desc"))
			.setClass("cna-settings-item")
			.addText((text) =>
				text
					.setValue(this.ctx.settings.keywordUnderlineColor)
					.onChange(async (value) => {
						await this.ctx.setSettings({ keywordUnderlineColor: value.trim() });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.font_weight.name"))
			.setDesc(this.ctx.t("settings.config.keyword.font_weight.desc"))
			.setClass("cna-settings-item")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("normal", this.ctx.t("settings.config.keyword.font_weight.option.normal"))
					.addOption("bold", this.ctx.t("settings.config.keyword.font_weight.option.bold"))
					.setValue(this.ctx.settings.keywordFontWeight)
					.onChange(async (value) => {
						if (!isKeywordFontWeight(value)) {
							return;
						}
						await this.ctx.setSettings({ keywordFontWeight: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.font_style.name"))
			.setDesc(this.ctx.t("settings.config.keyword.font_style.desc"))
			.setClass("cna-settings-item")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("normal", this.ctx.t("settings.config.keyword.font_style.option.normal"))
					.addOption("italic", this.ctx.t("settings.config.keyword.font_style.option.italic"))
					.setValue(this.ctx.settings.keywordFontStyle)
					.onChange(async (value) => {
						if (!isKeywordFontStyle(value)) {
							return;
						}
						await this.ctx.setSettings({ keywordFontStyle: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.keyword.text_color.name"))
			.setDesc(this.ctx.t("settings.config.keyword.text_color.desc"))
			.setClass("cna-settings-item")
			.addText((text) =>
				text
					.setValue(this.ctx.settings.keywordTextColor)
					.onChange(async (value) => {
						await this.ctx.setSettings({ keywordTextColor: value.trim() });
					}),
			);

		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.config.section.preview"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.preview.main_hover.name"))
			.setDesc(this.ctx.t("settings.config.preview.main_hover.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.previewMainHoverEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ previewMainHoverEnabled: value });
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.preview.sidebar_hover.name"))
			.setDesc(this.ctx.t("settings.config.preview.sidebar_hover.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.previewSidebarHoverEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ previewSidebarHoverEnabled: value });
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.preview.width.name"))
			.setDesc(this.ctx.t("settings.config.preview.width.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 10)
					.setValue(this.ctx.settings.previewWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.ctx.setSettings({ previewWidth: Math.round(value) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.preview.height.name"))
			.setDesc(this.ctx.t("settings.config.preview.height.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(120, 1000, 10)
					.setValue(this.ctx.settings.previewHeight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.ctx.setSettings({ previewHeight: Math.round(value) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.config.preview.max_lines.name"))
			.setDesc(this.ctx.t("settings.config.preview.max_lines.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(1, 30, 1)
					.setValue(this.ctx.settings.previewMaxLines)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.ctx.setSettings({ previewMaxLines: Math.round(value) });
					}),
			);
	}

	private renderNoteSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.note.section.main"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.note.default_rows.name"))
			.setDesc(this.ctx.t("settings.note.default_rows.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.ctx.settings.noteDefaultRows)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.ctx.setSettings({ noteDefaultRows: Math.round(value) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.note.image_expand.name"))
			.setDesc(this.ctx.t("settings.note.image_expand.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.noteImageAutoExpand)
					.onChange(async (value) => {
						await this.ctx.setSettings({ noteImageAutoExpand: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.note.tag_hint.name"))
			.setDesc(this.ctx.t("settings.note.tag_hint.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.noteTagHintTextEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ noteTagHintTextEnabled: value });
					}),
			);
	}

	private renderSnippetSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.snippet.section.main"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.snippet.quick_insert.enable.name"))
			.setDesc(this.ctx.t("settings.snippet.quick_insert.enable.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.snippetQuickInsertEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ snippetQuickInsertEnabled: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.snippet.quick_insert.page_size.name"))
			.setDesc(this.ctx.t("settings.snippet.quick_insert.page_size.desc"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.snippetQuickInsertEnabled)
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.ctx.settings.snippetQuickInsertPageSize)
					.setDynamicTooltip()
					.setDisabled(!this.ctx.settings.snippetQuickInsertEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ snippetQuickInsertPageSize: Math.round(value) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.snippet.text_fragment.enable.name"))
			.setDesc(this.ctx.t("settings.snippet.text_fragment.enable.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.snippetTextFragmentEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ snippetTextFragmentEnabled: value });
				}),
			);
	}

	private renderComingSoon(containerEl: HTMLElement): void {
		containerEl.createDiv({
			cls: "setting-item-description",
			text: this.ctx.t("settings.tab.coming_soon"),
		});
	}

	private renderTypesetSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.typeset.section.typeset"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.enable.name"))
			.setDesc(this.ctx.t("settings.typeset.enable.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.typesetEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ typesetEnabled: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.indent.name"))
			.setDesc(this.ctx.t("settings.typeset.indent.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(0, 6, 1)
					.setValue(this.ctx.settings.typesetIndentChars)
					.setDynamicTooltip()
					.setDisabled(!this.ctx.settings.typesetEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ typesetIndentChars: Math.round(value) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.line_spacing.name"))
			.setDesc(this.ctx.t("settings.typeset.line_spacing.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(0, 4, 0.1)
					.setValue(this.ctx.settings.typesetLineSpacing)
					.setDynamicTooltip()
					.setDisabled(!this.ctx.settings.typesetEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ typesetLineSpacing: Number(value.toFixed(1)) });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.paragraph_spacing.name"))
			.setDesc(this.ctx.t("settings.typeset.paragraph_spacing.desc"))
			.setClass("cna-settings-item")
			.addSlider((slider) =>
				slider
					.setLimits(0, 32, 1)
					.setValue(this.ctx.settings.typesetParagraphSpacing)
					.setDynamicTooltip()
					.setDisabled(!this.ctx.settings.typesetEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ typesetParagraphSpacing: Math.round(value) });
					}),
			);

		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.typeset.section.beautify"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.beautify.heading_icon.name"))
			.setDesc(this.ctx.t("settings.typeset.beautify.heading_icon.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.typesetShowHeadingIcons).onChange(async (value) => {
					await this.ctx.setSettings({ typesetShowHeadingIcons: value });
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.beautify.justify.name"))
			.setDesc(this.ctx.t("settings.typeset.beautify.justify.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.typesetJustifyText).onChange(async (value) => {
					await this.ctx.setSettings({ typesetJustifyText: value });
				}),
			);
	}

	private renderProofreadSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.proofread.section.common"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.enable.name"))
			.setDesc(this.ctx.t("settings.proofread.common.enable.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.proofreadCommonPunctuationEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ proofreadCommonPunctuationEnabled: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_comma.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadEnglishCommaEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadEnglishCommaEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_period.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadEnglishPeriodEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadEnglishPeriodEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_colon.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadEnglishColonEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadEnglishColonEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_semicolon.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadEnglishSemicolonEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadEnglishSemicolonEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_exclamation.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadEnglishExclamationEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadEnglishExclamationEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_question.name"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadEnglishQuestionEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadEnglishQuestionEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.quote.name"))
			.setDesc(this.ctx.t("settings.proofread.common.quote.desc"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadQuoteEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadQuoteEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.single_quote.name"))
			.setDesc(this.ctx.t("settings.proofread.common.single_quote.desc"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadSingleQuoteEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadSingleQuoteEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.pair_punctuation.name"))
			.setDesc(this.ctx.t("settings.proofread.common.pair_punctuation.desc"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadPairPunctuationEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadPairPunctuationEnabled: value });
					}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.auto_complete_pair.name"))
			.setDesc(this.ctx.t("settings.proofread.common.auto_complete_pair.desc"))
			.setClass("cna-settings-item")
			.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.proofreadAutoCompletePairPunctuationEnabled)
					.setDisabled(!this.ctx.settings.proofreadCommonPunctuationEnabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ proofreadAutoCompletePairPunctuationEnabled: value });
					}),
			);

		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.proofread.section.custom"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.custom.enable.name"))
			.setDesc(this.ctx.t("settings.proofread.custom.enable.desc"))
			.setClass("cna-settings-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.proofreadCustomDictionaryEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ proofreadCustomDictionaryEnabled: value });
				}),
			);
	}
}

function isSupportedLocale(value: string): value is SupportedLocale {
	return value === "zh_cn" || value === "zh_tw";
}

function isKeywordHighlightMode(value: string): value is "first" | "all" {
	return value === "first" || value === "all";
}

function isKeywordUnderlineStyle(value: string): value is "none" | "solid" | "dashed" | "dotted" | "double" | "wavy" {
	return value === "none" || value === "solid" || value === "dashed" || value === "dotted" || value === "double" || value === "wavy";
}

function isKeywordFontWeight(value: string): value is "normal" | "bold" {
	return value === "normal" || value === "bold";
}

function isKeywordFontStyle(value: string): value is "normal" | "italic" {
	return value === "normal" || value === "italic";
}

