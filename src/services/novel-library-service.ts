import { App, TFolder } from "obsidian";
import type { SupportedLocale } from "../lang";
import type { ChineseNovelAssistantSettings } from "../settings/settings";

export class NovelLibraryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private normalizeNovelLibrary(value: string): string {
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

	normalizeLibraryRoots(libraryPaths: string[]): string[] {
		return Array.from(
			new Set(
				libraryPaths
					.map((path) => this.normalizeVaultPath(path))
					.filter((path) => path.length > 0),
			),
		).sort((left, right) => right.length - left.length);
	}

	isSameOrChildPath(path: string, root: string): boolean {
		const normalizedPath = this.normalizeVaultPath(path);
		const normalizedRoot = this.normalizeVaultPath(root);
		if (!normalizedPath || !normalizedRoot) {
			return false;
		}
		return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
	}

	resolveContainingLibraryRoot(path: string, libraryRoots: string[]): string | null {
		const normalizedPath = this.normalizeVaultPath(path);
		if (!normalizedPath) {
			return null;
		}

		const normalizedRoots = this.normalizeLibraryRoots(libraryRoots);
		for (const root of normalizedRoots) {
			if (this.isSameOrChildPath(normalizedPath, root)) {
				return root;
			}
		}
		return null;
	}

	isPathInLibraries(path: string, libraryRoots: string[]): boolean {
		return this.resolveContainingLibraryRoot(path, libraryRoots) !== null;
	}

	private resolveNovelLibrarySubdirNames(settings: ChineseNovelAssistantSettings): string[] {
		const names = [
			settings.guidebookDirName,
			settings.stickyNoteDirName,
			settings.snippetDirName,
			settings.proofreadDictionaryDirName,
		]
			.map((name) => this.normalizeVaultPath(name))
			.filter((name) => name.length > 0);
		return Array.from(new Set(names));
	}

	private getNovelLibraryFeatureRootPath(normalizedLibraryPath: string, locale: SupportedLocale): string {
		if (!normalizedLibraryPath) {
			return "";
		}
		const featureDirName = this.resolveFeatureLibraryDirName(locale);
		if (!featureDirName) {
			return "";
		}
		return this.normalizeVaultPath(`${normalizedLibraryPath}/${featureDirName}`);
	}

	resolveNovelLibrarySubdirPaths(settings: ChineseNovelAssistantSettings, libraryPath: string): string[] {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return [];
		}
		const featureRootPath = this.getNovelLibraryFeatureRootPath(normalizedLibraryPath, settings.locale);
		if (!featureRootPath) {
			return [];
		}

		return this.resolveNovelLibrarySubdirNames(settings)
			.map((subdirName) => this.normalizeVaultPath(`${featureRootPath}/${subdirName}`))
			.filter((path) => path.length > 0);
	}

	resolveNovelLibrarySubdirPath(
		settings: Pick<ChineseNovelAssistantSettings, "locale">,
		libraryPath: string,
		subdirName: string,
	): string {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		const normalizedSubdirName = this.normalizeVaultPath(subdirName);
		if (!normalizedLibraryPath || !normalizedSubdirName) {
			return "";
		}

		const featureRootPath = this.getNovelLibraryFeatureRootPath(normalizedLibraryPath, settings.locale);
		if (!featureRootPath) {
			return "";
		}
		return this.normalizeVaultPath(`${featureRootPath}/${normalizedSubdirName}`);
	}

	resolveNovelLibraryFeatureRootPath(
		settings: Pick<ChineseNovelAssistantSettings, "locale">,
		libraryPath: string,
	): string {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return "";
		}
		return this.getNovelLibraryFeatureRootPath(normalizedLibraryPath, settings.locale);
	}

	async ensureNovelLibraryStructure(settings: ChineseNovelAssistantSettings, libraryPath: string): Promise<void> {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return;
		}

		await this.ensureFolderPath(normalizedLibraryPath);
		const featureRootPath = this.getNovelLibraryFeatureRootPath(normalizedLibraryPath, settings.locale);
		if (!featureRootPath) {
			return;
		}
		await this.ensureFolderPath(featureRootPath);
		for (const subdirName of this.resolveNovelLibrarySubdirNames(settings)) {
			await this.ensureFolderPath(`${featureRootPath}/${subdirName}`);
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

			const featureRootPath = this.getNovelLibraryFeatureRootPath(normalizedLibraryPath, settings.locale);
			if (!featureRootPath) {
				continue;
			}
			const oldSubdirPath = `${featureRootPath}/${normalizedPreviousName}`;
			const newSubdirPath = `${featureRootPath}/${normalizedNextName}`;
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

	private resolveFeatureLibraryDirName(locale: SupportedLocale): string {
		void locale;
		return this.normalizeVaultPath("功能库");
	}
}
