import { Setting } from "obsidian";
import type { SupportedLocale } from "../../../lang";
import { createSettingsSectionHeading } from "./heading";
import type { SettingsTabRenderContext } from "./types";

export function renderOtherSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx, refresh } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	createSettingsSectionHeading(panelEl, ctx.t("settings.other.section.common"));

	new Setting(panelEl)
		.setName(ctx.t("settings.language.name"))
		.setDesc(ctx.t("settings.language.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("zh_cn", ctx.t("settings.language.option.zh_cn"))
				.addOption("zh_tw", ctx.t("settings.language.option.zh_tw"))
				.setValue(ctx.locale)
				.onChange(async (value) => {
					if (!isSupportedLocale(value)) {
						return;
					}

					await ctx.setSettings({ locale: value });
					refresh();
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.other.open_file_in_new_tab.name"))
		.setDesc(ctx.t("settings.other.open_file_in_new_tab.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.openFileInNewTab).onChange(async (value) => {
				await ctx.setSettings({ openFileInNewTab: value });
			}),
		);

	createSettingsSectionHeading(panelEl, ctx.t("settings.other.section.word_count"));

	new Setting(panelEl)
		.setName(ctx.t("settings.other.enable_character_count.name"))
		.setDesc(ctx.t("settings.other.enable_character_count.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.enableCharacterCount).onChange(async (value) => {
				await ctx.setSettings({ enableCharacterCount: value });
				refresh();
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.other.enable_character_milestone.name"))
		.setDesc(ctx.t("settings.other.enable_character_milestone.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.enableCharacterCount)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.enableCharacterMilestone)
				.setDisabled(!ctx.settings.enableCharacterCount)
				.onChange(async (value) => {
					await ctx.setSettings({ enableCharacterMilestone: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.other.count_only_novel_library.name"))
		.setDesc(ctx.t("settings.other.count_only_novel_library.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.enableCharacterCount)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.countOnlyNovelLibrary)
				.setDisabled(!ctx.settings.enableCharacterCount)
				.onChange(async (value) => {
					await ctx.setSettings({ countOnlyNovelLibrary: value });
				}),
		);
}

function isSupportedLocale(value: string): value is SupportedLocale {
	return value === "zh_cn" || value === "zh_tw";
}
