import { Setting } from "obsidian";
import { createSettingsSectionHeading } from "./heading";
import type { SettingsTabRenderContext } from "./types";

export function renderGuidebookSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	createSettingsSectionHeading(panelEl, ctx.t("settings.guidebook.section.keyword_highlight"));

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.mode.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.mode.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("first", ctx.t("settings.guidebook.keyword.mode.option.first"))
				.addOption("all", ctx.t("settings.guidebook.keyword.mode.option.all"))
				.setValue(ctx.settings.guidebookKeywordHighlightMode)
				.onChange(async (value) => {
					if (!isKeywordHighlightMode(value)) {
						return;
					}
					await ctx.setSettings({ guidebookKeywordHighlightMode: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.background.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.background.desc"))
		.setClass("cna-settings-item")
		.addText((text) =>
			text.setValue(ctx.settings.guidebookKeywordHighlightBackgroundColor).onChange(async (value) => {
				await ctx.setSettings({ guidebookKeywordHighlightBackgroundColor: value.trim() });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.underline_style.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.underline_style.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("none", ctx.t("settings.guidebook.keyword.underline_style.option.none"))
				.addOption("solid", ctx.t("settings.guidebook.keyword.underline_style.option.solid"))
				.addOption("dashed", ctx.t("settings.guidebook.keyword.underline_style.option.dashed"))
				.addOption("dotted", ctx.t("settings.guidebook.keyword.underline_style.option.dotted"))
				.addOption("double", ctx.t("settings.guidebook.keyword.underline_style.option.double"))
				.addOption("wavy", ctx.t("settings.guidebook.keyword.underline_style.option.wavy"))
				.setValue(ctx.settings.guidebookKeywordUnderlineStyle)
				.onChange(async (value) => {
					if (!isKeywordUnderlineStyle(value)) {
						return;
					}
					await ctx.setSettings({ guidebookKeywordUnderlineStyle: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.underline_width.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.underline_width.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(0, 10, 1)
				.setValue(ctx.settings.guidebookKeywordUnderlineWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ guidebookKeywordUnderlineWidth: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.underline_color.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.underline_color.desc"))
		.setClass("cna-settings-item")
		.addText((text) =>
			text.setValue(ctx.settings.guidebookKeywordUnderlineColor).onChange(async (value) => {
				await ctx.setSettings({ guidebookKeywordUnderlineColor: value.trim() });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.font_weight.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.font_weight.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", ctx.t("settings.guidebook.keyword.font_weight.option.normal"))
				.addOption("bold", ctx.t("settings.guidebook.keyword.font_weight.option.bold"))
				.setValue(ctx.settings.guidebookKeywordFontWeight)
				.onChange(async (value) => {
					if (!isKeywordFontWeight(value)) {
						return;
					}
					await ctx.setSettings({ guidebookKeywordFontWeight: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.font_style.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.font_style.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", ctx.t("settings.guidebook.keyword.font_style.option.normal"))
				.addOption("italic", ctx.t("settings.guidebook.keyword.font_style.option.italic"))
				.setValue(ctx.settings.guidebookKeywordFontStyle)
				.onChange(async (value) => {
					if (!isKeywordFontStyle(value)) {
						return;
					}
					await ctx.setSettings({ guidebookKeywordFontStyle: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.keyword.text_color.name"))
		.setDesc(ctx.t("settings.guidebook.keyword.text_color.desc"))
		.setClass("cna-settings-item")
		.addText((text) =>
			text.setValue(ctx.settings.guidebookKeywordTextColor).onChange(async (value) => {
				await ctx.setSettings({ guidebookKeywordTextColor: value.trim() });
			}),
		);

	createSettingsSectionHeading(panelEl, ctx.t("settings.guidebook.section.preview"));

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.preview.main_hover.name"))
		.setDesc(ctx.t("settings.guidebook.preview.main_hover.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.guidebookPreviewMainHoverEnabled).onChange(async (value) => {
				await ctx.setSettings({ guidebookPreviewMainHoverEnabled: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.preview.sidebar_hover.name"))
		.setDesc(ctx.t("settings.guidebook.preview.sidebar_hover.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.guidebookPreviewSidebarHoverEnabled).onChange(async (value) => {
				await ctx.setSettings({ guidebookPreviewSidebarHoverEnabled: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.preview.width.name"))
		.setDesc(ctx.t("settings.guidebook.preview.width.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(200, 800, 10)
				.setValue(ctx.settings.guidebookPreviewWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ guidebookPreviewWidth: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.preview.max_lines.name"))
		.setDesc(ctx.t("settings.guidebook.preview.max_lines.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(1, 30, 1)
				.setValue(ctx.settings.guidebookPreviewMaxLines)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ guidebookPreviewMaxLines: Math.round(value) });
				}),
		);

	createSettingsSectionHeading(panelEl, ctx.t("settings.guidebook.section.other_features"));

	new Setting(panelEl)
		.setName(ctx.t("settings.guidebook.other.western_name_auto_alias.name"))
		.setDesc(ctx.t("settings.guidebook.other.western_name_auto_alias.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.guidebookWesternNameAutoAliasEnabled).onChange(async (value) => {
				await ctx.setSettings({ guidebookWesternNameAutoAliasEnabled: value });
			}),
		);
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

