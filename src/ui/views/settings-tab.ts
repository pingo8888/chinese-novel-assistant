import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { SupportedLocale } from "../../lang";
import type { PluginContext } from "../../core/context";
import { TabsComponent } from "../componets/tabs";

export class ChineseNovelAssistantSettingTab extends PluginSettingTab {
	private ctx: PluginContext;
	private activeTabId = "general";

	constructor(app: App, plugin: Plugin, ctx: PluginContext) {
		super(app, plugin);
		this.ctx = ctx;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const tabsContainer = containerEl.createDiv();
		new TabsComponent({
			containerEl: tabsContainer,
			defaultTabId: this.activeTabId,
			onTabChange: (tabId) => {
				this.activeTabId = tabId;
			},
			tabs: [
				{
					id: "general",
					label: this.ctx.t("settings.tab.global"),
					render: (panelEl) => this.renderComingSoon(panelEl),
				},
				{
					id: "guidebook",
					label: this.ctx.t("settings.tab.setting"),
					render: (panelEl) => this.renderComingSoon(panelEl),
				},
				{
					id: "note",
					label: this.ctx.t("settings.tab.sticky_note"),
					render: (panelEl) => this.renderComingSoon(panelEl),
				},
				{
					id: "proofread",
					label: this.ctx.t("settings.tab.proofread"),
					render: (panelEl) => this.renderProofreadSettings(panelEl),
				},
				{
					id: "snippet",
					label: this.ctx.t("settings.tab.snippet"),
					render: (panelEl) => this.renderComingSoon(panelEl),
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
			],
		});
	}

	private renderOtherSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.ctx.t("settings.language.name"))
			.setDesc(this.ctx.t("settings.language.desc"))
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
	}

	private renderComingSoon(containerEl: HTMLElement): void {
		containerEl.createDiv({
			cls: "setting-item-description",
			text: this.ctx.t("settings.tab.coming_soon"),
		});
	}

	private renderTypesetSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-typeset-panel" });
		panelEl.createEl("h4", {
			cls: "cna-typeset-section-title",
			text: this.ctx.t("settings.typeset.section.typeset"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.enable.name"))
			.setDesc(this.ctx.t("settings.typeset.enable.desc"))
			.setClass("cna-typeset-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.typesetEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ typesetEnabled: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.indent.name"))
			.setDesc(this.ctx.t("settings.typeset.indent.desc"))
			.setClass("cna-typeset-item")
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
			.setClass("cna-typeset-item")
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
			.setClass("cna-typeset-item")
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
			cls: "cna-typeset-section-title",
			text: this.ctx.t("settings.typeset.section.beautify"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.beautify.heading_icon.name"))
			.setDesc(this.ctx.t("settings.typeset.beautify.heading_icon.desc"))
			.setClass("cna-typeset-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.typesetShowHeadingIcons).onChange(async (value) => {
					await this.ctx.setSettings({ typesetShowHeadingIcons: value });
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.typeset.beautify.justify.name"))
			.setDesc(this.ctx.t("settings.typeset.beautify.justify.desc"))
			.setClass("cna-typeset-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.typesetJustifyText).onChange(async (value) => {
					await this.ctx.setSettings({ typesetJustifyText: value });
				}),
			);
	}

	private renderProofreadSettings(containerEl: HTMLElement): void {
		const panelEl = containerEl.createDiv({ cls: "cna-proofread-panel" });
		panelEl.createEl("h4", {
			cls: "cna-settings-section-title",
			text: this.ctx.t("settings.proofread.section.common"),
		});

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.enable.name"))
			.setDesc(this.ctx.t("settings.proofread.common.enable.desc"))
			.setClass("cna-proofread-item")
			.addToggle((toggle) =>
				toggle.setValue(this.ctx.settings.proofreadCommonPunctuationEnabled).onChange(async (value) => {
					await this.ctx.setSettings({ proofreadCommonPunctuationEnabled: value });
					this.display();
				}),
			);

		new Setting(panelEl)
			.setName(this.ctx.t("settings.proofread.common.english_comma.name"))
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
			.setClass("cna-proofread-item")
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
