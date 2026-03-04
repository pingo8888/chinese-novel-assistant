import { App, TFolder } from "obsidian";
import type { ChineseNovelAssistantSettings } from "../settings/settings";

export class NovelLibraryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	normalizeNovelLibrary(value: string): string {
		return value.trim().toLowerCase();
	}

	hasNovelLibrary(novelLibraries: string[], value: string): boolean {
		const normalizedValue = this.normalizeNovelLibrary(value);
		return novelLibraries.some((item) => this.normalizeNovelLibrary(item) === normalizedValue);
	}

	normalizeVaultPath(value: string): string {
		return value
			.trim()
			.replace(/\\/g, "/")
			.replace(/^\/+/, "")
			.replace(/\/+$/, "");
	}

	resolveNovelLibrarySubdirNames(settings: ChineseNovelAssistantSettings): string[] {
		const names = [
			settings.guidebookDirName,
			settings.noteDirName,
			settings.snippetDirName,
			settings.proofreadDictionaryDirName,
		]
			.map((name) => this.normalizeVaultPath(name))
			.filter((name) => name.length > 0);
		return Array.from(new Set(names));
	}

	async ensureNovelLibraryStructure(settings: ChineseNovelAssistantSettings, libraryPath: string): Promise<void> {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return;
		}

		await this.ensureFolderPath(normalizedLibraryPath);
		for (const subdirName of this.resolveNovelLibrarySubdirNames(settings)) {
			await this.ensureFolderPath(`${normalizedLibraryPath}/${subdirName}`);
		}
	}

	async syncSubdirNameAcrossLibraries(
		settings: ChineseNovelAssistantSettings,
		previousName: string,
		nextName: string,
	): Promise<void> {
		const normalizedPreviousName = this.normalizeVaultPath(previousName);
		const normalizedNextName = this.normalizeVaultPath(nextName);
		if (!normalizedPreviousName || !normalizedNextName || normalizedPreviousName === normalizedNextName) {
			return;
		}

		for (const libraryPath of settings.novelLibraries) {
			const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
			if (!normalizedLibraryPath) {
				continue;
			}

			const oldSubdirPath = `${normalizedLibraryPath}/${normalizedPreviousName}`;
			const newSubdirPath = `${normalizedLibraryPath}/${normalizedNextName}`;
			const oldEntry = this.app.vault.getAbstractFileByPath(oldSubdirPath);
			const newEntry = this.app.vault.getAbstractFileByPath(newSubdirPath);

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
					await this.ensureFolderPath(parentPath);
				}
				await this.app.fileManager.renameFile(oldEntry, newSubdirPath);
				continue;
			}

			if (!newEntry) {
				await this.ensureFolderPath(newSubdirPath);
			}
		}
	}

	private async ensureFolderPath(path: string): Promise<void> {
		const normalizedPath = this.normalizeVaultPath(path);
		if (!normalizedPath) {
			return;
		}

		const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
		let currentPath = "";
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
				continue;
			}

			if (!(existing instanceof TFolder)) {
				throw new Error(`Path already exists as file: ${currentPath}`);
			}
		}
	}
}

