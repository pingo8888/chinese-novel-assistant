import { Setting, type App } from "obsidian";
import { resolveStickyNoteCustomColors } from "../../../core";
import { createSettingsSectionHeading } from "./heading";
import type { SettingsTabRenderContext } from "./types";
import { renderColorConfigGroup } from "./custom-config-groups";
import { StickyNoteRepository } from "../../sticky-note/repository";

const STICKY_NOTE_COLOR_NAME_KEYS = [
	"settings.sticky_note.color.1",
	"settings.sticky_note.color.2",
	"settings.sticky_note.color.3",
	"settings.sticky_note.color.4",
	"settings.sticky_note.color.5",
	"settings.sticky_note.color.6",
	"settings.sticky_note.color.7",
] as const;
const STICKY_NOTE_COLOR_NAME_FALLBACK_KEY = "settings.sticky_note.color.7" as const;

const stickyNoteRepositoryByApp = new WeakMap<App, StickyNoteRepository>();

export function renderStickyNoteSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { ctx, refresh } = deps;
	const stickyNoteRepository = getStickyNoteRepository(ctx.app);
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	createSettingsSectionHeading(panelEl, ctx.t("settings.sticky_note.section.main"));

	new Setting(panelEl)
		.setName(ctx.t("settings.sticky_note.enable.name"))
		.setDesc(ctx.t("settings.sticky_note.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.stickyNoteEnabled).onChange(async (value) => {
				await ctx.setSettings({ stickyNoteEnabled: value });
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

	const colors = resolveStickyNoteCustomColors(ctx.settings.stickyNoteCustomColors);
	renderColorConfigGroup({
		app: ctx.app,
		panelEl,
		sectionTitle: ctx.t("settings.sticky_note.section.custom_colors"),
		disabled: !ctx.settings.stickyNoteEnabled,
		restoreDefaultsName: ctx.t("settings.sticky_note.restore_defaults.name"),
		restoreDefaultsDesc: ctx.t("settings.sticky_note.restore_defaults.desc"),
		restoreDefaultsLabel: ctx.t("settings.common.restore_defaults"),
		restoreDefaultsConfirmText: ctx.t("settings.common.confirm"),
		restoreDefaultsCancelText: ctx.t("settings.common.cancel"),
		labelInputPlaceholder: "",
		colorInputPlaceholder: "#4A86E9",
		items: colors.map((colorHex, index) => ({
			key: `${index}`,
			name: ctx.t(resolveStickyNoteColorNameKey(index)),
			colorHex,
		})),
		onColorChange: async (key, colorHex) => {
			const index = Number.parseInt(key, 10);
			if (!Number.isFinite(index) || index < 0) {
				return;
			}
			const previous = resolveStickyNoteCustomColors(ctx.settings.stickyNoteCustomColors);
			const next = [...previous];
			if (!next[index] || next[index] === colorHex) {
				return;
			}
			next[index] = colorHex;
			await ctx.setSettings({ stickyNoteCustomColors: next });
			await stickyNoteRepository.remapCardColorsByPalette(ctx.settings, previous, next);
		},
		onRestoreDefaults: async () => {
			const previous = resolveStickyNoteCustomColors(ctx.settings.stickyNoteCustomColors);
			const defaults = resolveStickyNoteCustomColors(undefined);
			await ctx.setSettings({
				stickyNoteCustomColors: defaults,
			});
			await stickyNoteRepository.remapCardColorsByPalette(ctx.settings, previous, defaults);
			refresh();
		},
	});
}

function getStickyNoteRepository(app: App): StickyNoteRepository {
	const cached = stickyNoteRepositoryByApp.get(app);
	if (cached) {
		return cached;
	}
	const repository = new StickyNoteRepository(app);
	stickyNoteRepositoryByApp.set(app, repository);
	return repository;
}

function resolveStickyNoteColorNameKey(index: number): (typeof STICKY_NOTE_COLOR_NAME_KEYS)[number] {
	return STICKY_NOTE_COLOR_NAME_KEYS[index] ?? STICKY_NOTE_COLOR_NAME_FALLBACK_KEY;
}
