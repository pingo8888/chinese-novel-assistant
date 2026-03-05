import { Setting } from "obsidian";
import type { SettingsTabRenderContext } from "./types";

export function renderTypesetSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx, refresh } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.typeset.section.typeset"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.typeset.enable.name"))
		.setDesc(ctx.t("settings.typeset.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.typesetEnabled).onChange(async (value) => {
				await ctx.setSettings({ typesetEnabled: value });
				refresh();
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.typeset.indent.name"))
		.setDesc(ctx.t("settings.typeset.indent.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.typesetEnabled)
		.addSlider((slider) =>
			slider
				.setLimits(0, 6, 1)
				.setValue(ctx.settings.typesetIndentChars)
				.setDynamicTooltip()
				.setDisabled(!ctx.settings.typesetEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ typesetIndentChars: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.typeset.line_spacing.name"))
		.setDesc(ctx.t("settings.typeset.line_spacing.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.typesetEnabled)
		.addSlider((slider) =>
			slider
				.setLimits(0, 4, 0.1)
				.setValue(ctx.settings.typesetLineSpacing)
				.setDynamicTooltip()
				.setDisabled(!ctx.settings.typesetEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ typesetLineSpacing: Number(value.toFixed(1)) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.typeset.paragraph_spacing.name"))
		.setDesc(ctx.t("settings.typeset.paragraph_spacing.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.typesetEnabled)
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(ctx.settings.typesetParagraphSpacing)
				.setDynamicTooltip()
				.setDisabled(!ctx.settings.typesetEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ typesetParagraphSpacing: Math.round(value) });
				}),
		);

	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.typeset.section.beautify"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.typeset.beautify.heading_icon.name"))
		.setDesc(ctx.t("settings.typeset.beautify.heading_icon.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.typesetShowHeadingIcons).onChange(async (value) => {
				await ctx.setSettings({ typesetShowHeadingIcons: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.typeset.beautify.justify.name"))
		.setDesc(ctx.t("settings.typeset.beautify.justify.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.typesetJustifyText).onChange(async (value) => {
				await ctx.setSettings({ typesetJustifyText: value });
			}),
		);
}
