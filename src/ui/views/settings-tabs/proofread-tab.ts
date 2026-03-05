import { Setting } from "obsidian";
import type { SettingsTabRenderContext } from "./types";

export function renderProofreadSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx, refresh } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.proofread.section.common"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.enable.name"))
		.setDesc(ctx.t("settings.proofread.common.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.proofreadCommonPunctuationEnabled).onChange(async (value) => {
				await ctx.setSettings({ proofreadCommonPunctuationEnabled: value });
				refresh();
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.english_comma.name"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadEnglishCommaEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadEnglishCommaEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.english_period.name"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadEnglishPeriodEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadEnglishPeriodEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.english_colon.name"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadEnglishColonEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadEnglishColonEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.english_semicolon.name"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadEnglishSemicolonEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadEnglishSemicolonEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.english_exclamation.name"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadEnglishExclamationEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadEnglishExclamationEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.english_question.name"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadEnglishQuestionEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadEnglishQuestionEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.quote.name"))
		.setDesc(ctx.t("settings.proofread.common.quote.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadQuoteEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadQuoteEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.single_quote.name"))
		.setDesc(ctx.t("settings.proofread.common.single_quote.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadSingleQuoteEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadSingleQuoteEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.pair_punctuation.name"))
		.setDesc(ctx.t("settings.proofread.common.pair_punctuation.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadPairPunctuationEnabled)
				.setDisabled(!ctx.settings.proofreadCommonPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadPairPunctuationEnabled: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.common.auto_complete_pair.name"))
		.setDesc(ctx.t("settings.proofread.common.auto_complete_pair.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.proofreadAutoCompletePairPunctuationEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ proofreadAutoCompletePairPunctuationEnabled: value });
				}),
		);

	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.proofread.section.custom"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.proofread.custom.enable.name"))
		.setDesc(ctx.t("settings.proofread.custom.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.proofreadCustomDictionaryEnabled).onChange(async (value) => {
				await ctx.setSettings({ proofreadCustomDictionaryEnabled: value });
			}),
		);
}
