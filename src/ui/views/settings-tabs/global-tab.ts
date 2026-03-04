import { Notice, Setting } from "obsidian";
import { NovelLibraryService } from "../../../services/novel-library-service";
import { attachFolderSuggest } from "../../componets/folder-suggest";
import { askForConfirmation } from "../../modals/confirm-modal";
import type { SettingsTabRenderContext } from "./types";

interface SubdirSyncSettingOptions {
	name: string;
	currentName: string;
	isEnabled: boolean;
	onSave: (nextName: string) => Promise<void>;
}

export function renderGlobalSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { app, ctx, refresh } = deps;
	const novelLibraryService = new NovelLibraryService(app);
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.global.section.novel_library"),
	});

	for (const libraryPath of ctx.settings.novelLibraries) {
		const librarySetting = new Setting(panelEl)
			.setName(libraryPath)
			.setClass("cna-settings-item")
			.addButton((button) => {
				button.setButtonText(ctx.t("settings.common.delete")).onClick(async () => {
					const shouldDelete = await askForConfirmation(app, {
						title: ctx.t("settings.global.novel_library.delete_confirm.title"),
						message: ctx.t("settings.global.novel_library.delete_confirm.message"),
						confirmText: ctx.t("settings.common.delete"),
						cancelText: ctx.t("settings.common.cancel"),
						confirmIsDanger: true,
					});
					if (!shouldDelete) {
						return;
					}

					await ctx.setSettings({
						novelLibraries: ctx.settings.novelLibraries.filter((value) => value !== libraryPath),
					});
					refresh();
				});
				button.buttonEl.addClass("cna-danger-button");
			});
		librarySetting.settingEl.addClass("cna-settings-item--novel-library");
	}

	let pendingValue = "";
	let pendingInputEl: HTMLInputElement | null = null;
	new Setting(panelEl)
		.setName(ctx.t("settings.global.novel_library.add.name"))
		.setDesc(ctx.t("settings.global.novel_library.add.desc"))
		.setClass("cna-settings-item")
		.addText((text) => {
			text.setPlaceholder(ctx.t("settings.global.novel_library.add.placeholder"));
			pendingInputEl = text.inputEl;
			text.onChange((value) => {
				pendingValue = value;
			});
		})
		.addButton((button) =>
			button
				.setButtonText(ctx.t("settings.common.add"))
				.setCta()
				.onClick(async () => {
					const next = pendingValue.trim();
					if (!next) {
						return;
					}

					if (novelLibraryService.hasNovelLibrary(ctx.settings.novelLibraries, next)) {
						new Notice(ctx.t("settings.global.novel_library.exists"));
						return;
					}

					try {
						await novelLibraryService.ensureNovelLibraryStructure(ctx.settings, next);
					} catch (error) {
						console.error("[Chinese Novel Assistant] Failed to create novel library structure.", error);
						new Notice(ctx.t("settings.global.novel_library.create_subdirs_failed"));
						return;
					}

					await ctx.setSettings({
						novelLibraries: [...ctx.settings.novelLibraries, next],
					});
					refresh();
				}),
		);
	if (pendingInputEl) {
		attachFolderSuggest(app, pendingInputEl);
	}

	panelEl.createEl("h4", {
		cls: "cna-settings-section-title",
		text: ctx.t("settings.global.section.novel_subdir"),
	});

	new Setting(panelEl)
		.setName(ctx.t("settings.global.subdir.hide_in_file_explorer.name"))
		.setDesc(ctx.t("settings.global.subdir.hide_in_file_explorer.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.hideNovelSubdirsInFileExplorer).onChange(async (value) => {
				await ctx.setSettings({ hideNovelSubdirsInFileExplorer: value });
			}),
		);

	new Setting(panelEl)
		.setName(ctx.t("settings.global.subdir.enable.name"))
		.setDesc(ctx.t("settings.global.subdir.enable.desc"))
		.setClass("cna-settings-item")
		.addToggle((toggle) =>
			toggle.setValue(ctx.settings.customDirNamesEnabled).onChange(async (value) => {
				await ctx.setSettings({ customDirNamesEnabled: value });
				refresh();
			}),
		);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.guidebook.name"),
		currentName: ctx.settings.guidebookDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ guidebookDirName: nextName });
		},
	}, deps, novelLibraryService);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.note.name"),
		currentName: ctx.settings.noteDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ noteDirName: nextName });
		},
	}, deps, novelLibraryService);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.snippet.name"),
		currentName: ctx.settings.snippetDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ snippetDirName: nextName });
		},
	}, deps, novelLibraryService);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.proofread.name"),
		currentName: ctx.settings.proofreadDictionaryDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ proofreadDictionaryDirName: nextName });
		},
	}, deps, novelLibraryService);
}

function formatCurrentSubdirName(currentNameLabel: string, name: string): string {
	return `（${currentNameLabel}：${name}）`;
}

function appendCurrentSubdirNameTag(deps: SettingsTabRenderContext, setting: Setting, currentName: string): void {
	const nameEl = setting.settingEl.querySelector<HTMLElement>(".setting-item-name");
	if (!nameEl) {
		return;
	}

	nameEl.createSpan({
		cls: "cna-settings-current-name",
		text: formatCurrentSubdirName(deps.ctx.t("settings.global.subdir.current_name_label"), currentName),
	});
}

function renderSubdirSyncSetting(
	panelEl: HTMLElement,
	options: SubdirSyncSettingOptions,
	deps: SettingsTabRenderContext,
	novelLibraryService: NovelLibraryService,
): void {
	const { ctx, refresh } = deps;
	let draftName = options.currentName;
	const setting = new Setting(panelEl)
		.setName(options.name)
		.setClass("cna-settings-item")
		.setDisabled(!options.isEnabled)
		.addText((text) =>
			text
				.setValue(options.currentName)
				.setDisabled(!options.isEnabled)
				.onChange((value) => {
					draftName = value;
				}),
		)
		.addButton((button) =>
			button
				.setButtonText(ctx.t("settings.common.sync"))
				.setDisabled(!options.isEnabled)
				.onClick(async () => {
					const nextName = draftName.trim();
					const normalizedCurrentName = novelLibraryService.normalizeVaultPath(options.currentName);
					const normalizedNextName = novelLibraryService.normalizeVaultPath(nextName);
					if (!normalizedNextName || normalizedNextName === normalizedCurrentName) {
						return;
					}

					const shouldSync = await askForConfirmation(deps.app, {
						title: ctx.t("settings.global.subdir.sync_confirm.title"),
						message: ctx.t("settings.global.subdir.sync_confirm.message"),
						confirmText: ctx.t("settings.common.sync"),
						cancelText: ctx.t("settings.common.cancel"),
					});
					if (!shouldSync) {
						return;
					}

					try {
						await novelLibraryService.syncSubdirNameAcrossLibraries(ctx.settings, options.currentName, nextName);
						await options.onSave(nextName);
						refresh();
					} catch (error) {
						console.error("[Chinese Novel Assistant] Failed to sync subdir name.", error);
						new Notice(ctx.t("settings.global.subdir.rename_failed"));
					}
				}),
		);

	appendCurrentSubdirNameTag(deps, setting, options.currentName);
}
