import { Notice, Setting, TFolder } from "obsidian";
import { NovelLibraryService } from "../../../core";
import { attachFolderSuggest } from "../../../ui/componets/folder-suggest";
import { askForConfirmation } from "../../../ui/modals/confirm-modal";
import { createSettingsSectionHeading } from "./heading";
import type { SettingsTabRenderContext } from "./types";

const NOVEL_LIBRARY_FEATURE_DIR_NAMES = new Set(["00_功能库", "00-功能库"].map((name) => name.toLowerCase()));

export function renderGlobalSettings(containerEl: HTMLElement, deps: SettingsTabRenderContext): void {
	const { app, ctx, refresh } = deps;
	const novelLibraryService = new NovelLibraryService(app);
	const normalizedLibraryRoots = novelLibraryService.normalizeLibraryRoots(ctx.settings.novelLibraries);
	const panelEl = containerEl.createDiv({ cls: "cna-settings-panel" });
	createSettingsSectionHeading(panelEl, ctx.t("settings.global.section.novel_library"));

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
						await novelLibraryService.ensureNovelLibraryStructure(next);
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
		attachFolderSuggest(app, pendingInputEl, {
			shouldIncludeFolderPath: (path) =>
				shouldIncludeNovelLibrarySuggestion(path, normalizedLibraryRoots, novelLibraryService),
		});
	}

	for (const libraryPath of ctx.settings.novelLibraries) {
		const normalizedLibraryPath = novelLibraryService.normalizeVaultPath(libraryPath);
		const libraryEntry = normalizedLibraryPath ? app.vault.getAbstractFileByPath(normalizedLibraryPath) : null;
		const isMissingLibrary = !(libraryEntry instanceof TFolder);
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
		if (isMissingLibrary) {
			appendMissingNovelLibraryTag(deps, librarySetting);
		}
	}
}

function appendMissingNovelLibraryTag(deps: SettingsTabRenderContext, setting: Setting): void {
	const nameEl = setting.settingEl.querySelector<HTMLElement>(".setting-item-name");
	if (!nameEl) {
		return;
	}

	nameEl.createSpan({
		cls: "cna-settings-missing-library",
		text: deps.ctx.t("settings.global.novel_library.missing"),
	});
}


function shouldIncludeNovelLibrarySuggestion(
	path: string,
	normalizedLibraryRoots: string[],
	novelLibraryService: NovelLibraryService,
): boolean {
	const normalizedPath = novelLibraryService.normalizeVaultPath(path);
	if (!normalizedPath) {
		return false;
	}
	if (isFeatureLibraryPath(normalizedPath)) {
		return false;
	}
	return !normalizedLibraryRoots.some((root) => novelLibraryService.isSameOrChildPath(normalizedPath, root));
}

function isFeatureLibraryPath(path: string): boolean {
	return path
		.split("/")
		.filter((segment) => segment.length > 0)
		.some((segment) => NOVEL_LIBRARY_FEATURE_DIR_NAMES.has(segment.toLowerCase()));
}



