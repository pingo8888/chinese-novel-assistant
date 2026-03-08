import { Setting } from "obsidian";
import { createSettingsSectionHeading } from "./heading";
import type { SettingsTabRenderContext } from "./types";

export function renderSnippetSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx, refresh } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	createSettingsSectionHeading(panelEl, ctx.t("settings.snippet.section.punctuation"));

	new Setting(panelEl)
		.setName(ctx.t("settings.snippet.punctuation.auto_complete_pair.name"))
		.setDesc(ctx.t("settings.snippet.punctuation.auto_complete_pair.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.autocompletePairPunctuationEnabled).onChange(async (value) => {
				await ctx.setSettings({ autocompletePairPunctuationEnabled: value });
			}),
		);

	createSettingsSectionHeading(panelEl, ctx.t("settings.snippet.section.main"));

	new Setting(panelEl)
		.setName(ctx.t("settings.snippet.quick_insert.enable.name"))
		.setDesc(ctx.t("settings.snippet.quick_insert.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.snippetQuickInsertEnabled).onChange(async (value) => {
				await ctx.setSettings({ snippetQuickInsertEnabled: value });
				refresh();
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.snippet.text_fragment.enable.name"))
		.setDesc(ctx.t("settings.snippet.text_fragment.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.snippetTextFragmentEnabled).onChange(async (value) => {
				await ctx.setSettings({ snippetTextFragmentEnabled: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.snippet.quick_insert.page_size.name"))
		.setDesc(ctx.t("settings.snippet.quick_insert.page_size.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(1, 20, 1)
				.setValue(ctx.settings.snippetQuickInsertPageSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ snippetQuickInsertPageSize: Math.round(value) });
				}),
		);
}
