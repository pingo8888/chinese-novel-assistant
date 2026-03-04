import { Setting } from "obsidian";
import type { SettingsTabRenderContext } from "./types";

export function renderGuidebookSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.config.section.keyword_highlight"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.mode.name"))
		.setDesc(ctx.t("settings.config.keyword.mode.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("first", ctx.t("settings.config.keyword.mode.option.first"))
				.addOption("all", ctx.t("settings.config.keyword.mode.option.all"))
				.setValue(ctx.settings.keywordHighlightMode)
				.onChange(async (value) => {
					if (!isKeywordHighlightMode(value)) {
						return;
					}
					await ctx.setSettings({ keywordHighlightMode: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.background.name"))
		.setDesc(ctx.t("settings.config.keyword.background.desc"))
		.setClass("cna-settings-item")
		.addText((text) =>
			text.setValue(ctx.settings.keywordHighlightBackgroundColor).onChange(async (value) => {
				await ctx.setSettings({ keywordHighlightBackgroundColor: value.trim() });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.underline_style.name"))
		.setDesc(ctx.t("settings.config.keyword.underline_style.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("none", ctx.t("settings.config.keyword.underline_style.option.none"))
				.addOption("solid", ctx.t("settings.config.keyword.underline_style.option.solid"))
				.addOption("dashed", ctx.t("settings.config.keyword.underline_style.option.dashed"))
				.addOption("dotted", ctx.t("settings.config.keyword.underline_style.option.dotted"))
				.addOption("double", ctx.t("settings.config.keyword.underline_style.option.double"))
				.addOption("wavy", ctx.t("settings.config.keyword.underline_style.option.wavy"))
				.setValue(ctx.settings.keywordUnderlineStyle)
				.onChange(async (value) => {
					if (!isKeywordUnderlineStyle(value)) {
						return;
					}
					await ctx.setSettings({ keywordUnderlineStyle: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.underline_width.name"))
		.setDesc(ctx.t("settings.config.keyword.underline_width.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(0, 10, 1)
				.setValue(ctx.settings.keywordUnderlineWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ keywordUnderlineWidth: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.underline_color.name"))
		.setDesc(ctx.t("settings.config.keyword.underline_color.desc"))
		.setClass("cna-settings-item")
		.addText((text) =>
			text.setValue(ctx.settings.keywordUnderlineColor).onChange(async (value) => {
				await ctx.setSettings({ keywordUnderlineColor: value.trim() });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.font_weight.name"))
		.setDesc(ctx.t("settings.config.keyword.font_weight.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", ctx.t("settings.config.keyword.font_weight.option.normal"))
				.addOption("bold", ctx.t("settings.config.keyword.font_weight.option.bold"))
				.setValue(ctx.settings.keywordFontWeight)
				.onChange(async (value) => {
					if (!isKeywordFontWeight(value)) {
						return;
					}
					await ctx.setSettings({ keywordFontWeight: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.font_style.name"))
		.setDesc(ctx.t("settings.config.keyword.font_style.desc"))
		.setClass("cna-settings-item")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", ctx.t("settings.config.keyword.font_style.option.normal"))
				.addOption("italic", ctx.t("settings.config.keyword.font_style.option.italic"))
				.setValue(ctx.settings.keywordFontStyle)
				.onChange(async (value) => {
					if (!isKeywordFontStyle(value)) {
						return;
					}
					await ctx.setSettings({ keywordFontStyle: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.keyword.text_color.name"))
		.setDesc(ctx.t("settings.config.keyword.text_color.desc"))
		.setClass("cna-settings-item")
		.addText((text) =>
			text.setValue(ctx.settings.keywordTextColor).onChange(async (value) => {
				await ctx.setSettings({ keywordTextColor: value.trim() });
			}),
		);

	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.config.section.preview"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.config.preview.main_hover.name"))
		.setDesc(ctx.t("settings.config.preview.main_hover.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.previewMainHoverEnabled).onChange(async (value) => {
				await ctx.setSettings({ previewMainHoverEnabled: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.preview.sidebar_hover.name"))
		.setDesc(ctx.t("settings.config.preview.sidebar_hover.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.previewSidebarHoverEnabled).onChange(async (value) => {
				await ctx.setSettings({ previewSidebarHoverEnabled: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.preview.width.name"))
		.setDesc(ctx.t("settings.config.preview.width.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(200, 800, 10)
				.setValue(ctx.settings.previewWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ previewWidth: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.preview.height.name"))
		.setDesc(ctx.t("settings.config.preview.height.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(120, 1000, 10)
				.setValue(ctx.settings.previewHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ previewHeight: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.config.preview.max_lines.name"))
		.setDesc(ctx.t("settings.config.preview.max_lines.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(1, 30, 1)
				.setValue(ctx.settings.previewMaxLines)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ previewMaxLines: Math.round(value) });
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

