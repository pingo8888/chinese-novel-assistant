import { Setting } from "obsidian";
import type { SettingsTabRenderContext } from "./types";

export function renderNoteSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.note.section.main"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.note.default_rows.name"))
		.setDesc(ctx.t("settings.note.default_rows.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(1, 20, 1)
				.setValue(ctx.settings.noteDefaultRows)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ noteDefaultRows: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.note.image_expand.name"))
		.setDesc(ctx.t("settings.note.image_expand.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.noteImageAutoExpand).onChange(async (value) => {
				await ctx.setSettings({ noteImageAutoExpand: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.note.tag_hint.name"))
		.setDesc(ctx.t("settings.note.tag_hint.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.noteTagHintTextEnabled).onChange(async (value) => {
				await ctx.setSettings({ noteTagHintTextEnabled: value });
			}),
		);
}

