import { Notice, Setting, TFolder } from "obsidian";
import { attachFolderSuggest } from "../../componets/folder-suggest";
import type { SettingsTabRenderContext } from "./types";

interface SubdirSyncSettingOptions {
	name: string;
	currentName: string;
	isEnabled: boolean;
	onSave: (nextName: string) => Promise<void>;
}

export function renderGlobalSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { app, ctx, refresh } = deps;
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

					if (hasNovelLibrary(ctx.settings.novelLibraries, next)) {
						new Notice(ctx.t("settings.global.novel_library.exists"));
						return;
					}

					try {
						await ensureNovelLibraryStructure(deps, next);
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
		text: ctx.t("settings.global.section.custom_subdir"),
	});

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
	}, deps);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.note.name"),
		currentName: ctx.settings.noteDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ noteDirName: nextName });
		},
	}, deps);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.snippet.name"),
		currentName: ctx.settings.snippetDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ snippetDirName: nextName });
		},
	}, deps);

	renderSubdirSyncSetting(panelEl, {
		name: ctx.t("settings.global.subdir.proofread.name"),
		currentName: ctx.settings.proofreadDictionaryDirName,
		isEnabled: ctx.settings.customDirNamesEnabled,
		onSave: async (nextName) => {
			await ctx.setSettings({ proofreadDictionaryDirName: nextName });
		},
	}, deps);
}

function normalizeNovelLibrary(value: string): string {
	return value.trim().toLowerCase();
}

function hasNovelLibrary(novelLibraries: string[], value: string): boolean {
	const normalizedValue = normalizeNovelLibrary(value);
	return novelLibraries.some((item) => normalizeNovelLibrary(item) === normalizedValue);
}

function normalizeVaultPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

function resolveNovelLibrarySubdirNames(deps: SettingsTabRenderContext): string[] {
	const { ctx } = deps;
	const names = [
		ctx.settings.guidebookDirName,
		ctx.settings.noteDirName,
		ctx.settings.snippetDirName,
		ctx.settings.proofreadDictionaryDirName,
	]
		.map((name) => normalizeVaultPath(name))
		.filter((name) => name.length > 0);
	return Array.from(new Set(names));
}

async function ensureFolderPath(deps: SettingsTabRenderContext, path: string): Promise<void> {
	const { app } = deps;
	const normalizedPath = normalizeVaultPath(path);
	if (!normalizedPath) {
		return;
	}

	const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
	let currentPath = "";
	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (!existing) {
			await app.vault.createFolder(currentPath);
			continue;
		}

		if (!(existing instanceof TFolder)) {
			throw new Error(`Path already exists as file: ${currentPath}`);
		}
	}
}

async function ensureNovelLibraryStructure(deps: SettingsTabRenderContext, libraryPath: string): Promise<void> {
	const normalizedLibraryPath = normalizeVaultPath(libraryPath);
	if (!normalizedLibraryPath) {
		return;
	}

	await ensureFolderPath(deps, normalizedLibraryPath);
	for (const subdirName of resolveNovelLibrarySubdirNames(deps)) {
		await ensureFolderPath(deps, `${normalizedLibraryPath}/${subdirName}`);
	}
}

async function syncSubdirNameAcrossLibraries(
	deps: SettingsTabRenderContext,
	previousName: string,
	nextName: string,
): Promise<void> {
	const { app, ctx } = deps;
	const normalizedPreviousName = normalizeVaultPath(previousName);
	const normalizedNextName = normalizeVaultPath(nextName);
	if (!normalizedPreviousName || !normalizedNextName || normalizedPreviousName === normalizedNextName) {
		return;
	}

	for (const libraryPath of ctx.settings.novelLibraries) {
		const normalizedLibraryPath = normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			continue;
		}

		const oldSubdirPath = `${normalizedLibraryPath}/${normalizedPreviousName}`;
		const newSubdirPath = `${normalizedLibraryPath}/${normalizedNextName}`;
		const oldEntry = app.vault.getAbstractFileByPath(oldSubdirPath);
		const newEntry = app.vault.getAbstractFileByPath(newSubdirPath);

		if (oldEntry && !(oldEntry instanceof TFolder)) {
			throw new Error(`Old subdir path exists as file: ${oldSubdirPath}`);
		}
		if (newEntry && !(newEntry instanceof TFolder)) {
			throw new Error(`New subdir path exists as file: ${newSubdirPath}`);
		}

		if (oldEntry instanceof TFolder) {
			if (newEntry instanceof TFolder) {
				continue;
			}

			const parentPath = newSubdirPath.split("/").slice(0, -1).join("/");
			if (parentPath) {
				await ensureFolderPath(deps, parentPath);
			}
			await app.fileManager.renameFile(oldEntry, newSubdirPath);
			continue;
		}

		if (!newEntry) {
			await ensureFolderPath(deps, newSubdirPath);
		}
	}
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
					const normalizedCurrentName = normalizeVaultPath(options.currentName);
					const normalizedNextName = normalizeVaultPath(nextName);
					if (!normalizedNextName || normalizedNextName === normalizedCurrentName) {
						return;
					}

					try {
						await syncSubdirNameAcrossLibraries(deps, options.currentName, nextName);
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
