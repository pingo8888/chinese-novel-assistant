import { Setting } from "obsidian";
import { IDS } from "../../../constants";
import type { SettingsTabRenderContext } from "./types";

export function renderStickyNoteSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { app, ctx, refresh } = deps;
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.sticky_note.section.main"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.enable.name"))
		.setDesc(ctx.t("settings.sticky_note.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.stickyNoteEnabled).onChange(async (value) => {
				await ctx.setSettings({ stickyNoteEnabled: value });
				if (!value) {
					for (const leaf of app.workspace.getLeavesOfType(IDS.view.stickyNoteSidebar)) {
						leaf.detach();
					}
					refresh();
					return;
				}
				await app.workspace.ensureSideLeaf(IDS.view.stickyNoteSidebar, "right", {
					active: false,
					reveal: false,
					split: false,
				});
				refresh();
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.default_rows.name"))
		.setDesc(ctx.t("settings.sticky_note.default_rows.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.stickyNoteEnabled)
		.addSlider((slider) =>
			slider
				.setLimits(1, 20, 1)
				.setValue(ctx.settings.stickyNoteDefaultRows)
				.setDisabled(!ctx.settings.stickyNoteEnabled)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await ctx.setSettings({ stickyNoteDefaultRows: Math.round(value) });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.image_expand.name"))
		.setDesc(ctx.t("settings.sticky_note.image_expand.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.stickyNoteEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.stickyNoteImageAutoExpand)
				.setDisabled(!ctx.settings.stickyNoteEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ stickyNoteImageAutoExpand: value });
				}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.tag_hint.name"))
		.setDesc(ctx.t("settings.sticky_note.tag_hint.desc"))
		.setClass("cna-settings-item")
		.setDisabled(!ctx.settings.stickyNoteEnabled)
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.stickyNoteTagHintTextEnabled)
				.setDisabled(!ctx.settings.stickyNoteEnabled)
				.onChange(async (value) => {
					await ctx.setSettings({ stickyNoteTagHintTextEnabled: value });
				}),
		);
}
