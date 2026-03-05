import { Setting } from "obsidian";
import type { SettingsTabRenderContext } from "./types";

export function renderStickyNoteSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.sticky_note.section.main"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.default_rows.name"))
		.setDesc(ctx.t("settings.sticky_note.default_rows.desc"))
		.setClass("cna-settings-item")
		.addSlider((slider) =>
			slider
				.setLimits(1, 20, 1)
				.setValue(ctx.settings.stickyNoteDefaultRows)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ stickyNoteDefaultRows: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.image_expand.name"))
		.setDesc(ctx.t("settings.sticky_note.image_expand.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.stickyNoteImageAutoExpand).onChange(async (value) => {
				await ctx.setSettings({ stickyNoteImageAutoExpand: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.tag_hint.name"))
		.setDesc(ctx.t("settings.sticky_note.tag_hint.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.stickyNoteTagHintTextEnabled).onChange(async (value) => {
				await ctx.setSettings({ stickyNoteTagHintTextEnabled: value });
			}),
		);
}
