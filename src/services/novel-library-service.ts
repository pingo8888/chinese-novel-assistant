import { App, TFolder } from "obsidian";
import type { SupportedLocale } from "../lang";
import type { ChineseNovelAssistantSettings } from "../settings/settings";

export const NOVEL_LIBRARY_SUBDIR_NAMES = {
	guidebook: "设定库",
	stickyNote: "便签库",
	snippet: "片段库",
	proofreadDictionary: "纠错词库",
} as const;

type NovelLibrarySubdirKey = keyof typeof NOVEL_LIBRARY_SUBDIR_NAMES;

const NOVEL_LIBRARY_SUBDIR_KEYS = Object.keys(NOVEL_LIBRARY_SUBDIR_NAMES) as NovelLibrarySubdirKey[];

const NOVEL_LIBRARY_FEATURE_DIR_NAMES: Record<SupportedLocale, string> = {
	zh_cn: "00_功能库",
	zh_tw: "00_功能庫",
};

const NOVEL_LIBRARY_SUBDIR_NAMES_BY_LOCALE: Record<SupportedLocale, Record<NovelLibrarySubdirKey, string>> = {
	zh_cn: {
		guidebook: "设定库",
		stickyNote: "便签库",
		snippet: "片段库",
		proofreadDictionary: "纠错词库",
	},
	zh_tw: {
		guidebook: "設定庫",
		stickyNote: "便箋庫",
		snippet: "片段庫",
		proofreadDictionary: "糾錯詞庫",
	},
};

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

	private getNovelLibraryFeatureRootPath(normalizedLibraryPath: string, locale: SupportedLocale): string {
		if (!normalizedLibraryPath) {
			return "";
		}

		const preferredFeatureDirName = this.resolveFeatureLibraryDirName(locale);
		if (!preferredFeatureDirName) {
			return "";
		}

		const candidateFeatureRootPaths = this.resolveFeatureLibraryDirNameCandidates(locale)
			.map((dirName) => this.normalizeVaultPath(`${normalizedLibraryPath}/${dirName}`))
			.filter((path) => path.length > 0);

		const existingFeatureRootPath = this.resolveBestExistingFeatureRootPath(candidateFeatureRootPaths, locale);
		if (existingFeatureRootPath) {
			return existingFeatureRootPath;
		}

		return this.normalizeVaultPath(`${normalizedLibraryPath}/${preferredFeatureDirName}`);
	}

	resolveNovelLibrarySubdirPaths(settings: Pick<ChineseNovelAssistantSettings, "locale">, libraryPath: string): string[] {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return [];
		}
		const featureRootPath = this.getNovelLibraryFeatureRootPath(normalizedLibraryPath, settings.locale);
		if (!featureRootPath) {
			return [];
		}

		return NOVEL_LIBRARY_SUBDIR_KEYS
			.map((subdirKey) => this.resolveCompatibleSubdirPath(featureRootPath, settings.locale, subdirKey))
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

		const subdirKey = this.resolveSubdirKey(normalizedSubdirName);
		if (!subdirKey) {
			return this.normalizeVaultPath(`${featureRootPath}/${normalizedSubdirName}`);
		}
		return this.resolveCompatibleSubdirPath(featureRootPath, settings.locale, subdirKey);
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

	async ensureNovelLibraryStructure(settings: Pick<ChineseNovelAssistantSettings, "locale">, libraryPath: string): Promise<void> {
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
		for (const subdirKey of NOVEL_LIBRARY_SUBDIR_KEYS) {
			const subdirPath = this.resolveCompatibleSubdirPath(featureRootPath, settings.locale, subdirKey);
			await this.ensureFolderPath(subdirPath);
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
		return this.normalizeVaultPath(NOVEL_LIBRARY_FEATURE_DIR_NAMES[locale]);
	}

	private resolveFeatureLibraryDirNameCandidates(locale: SupportedLocale): string[] {
		const preferred = this.resolveFeatureLibraryDirName(locale);
		const candidates = [preferred];
		for (const supportedLocale of Object.keys(NOVEL_LIBRARY_FEATURE_DIR_NAMES) as SupportedLocale[]) {
			const candidate = this.normalizeVaultPath(NOVEL_LIBRARY_FEATURE_DIR_NAMES[supportedLocale]);
			if (!candidate || candidates.includes(candidate)) {
				continue;
			}
			candidates.push(candidate);
		}
		return candidates;
	}

	private resolveNovelLibrarySubdirName(locale: SupportedLocale, subdirKey: NovelLibrarySubdirKey): string {
		return this.normalizeVaultPath(NOVEL_LIBRARY_SUBDIR_NAMES_BY_LOCALE[locale][subdirKey]);
	}

	private resolveNovelLibrarySubdirNameCandidates(locale: SupportedLocale, subdirKey: NovelLibrarySubdirKey): string[] {
		const preferred = this.resolveNovelLibrarySubdirName(locale, subdirKey);
		const candidates = [preferred];
		for (const supportedLocale of Object.keys(NOVEL_LIBRARY_SUBDIR_NAMES_BY_LOCALE) as SupportedLocale[]) {
			const candidate = this.normalizeVaultPath(NOVEL_LIBRARY_SUBDIR_NAMES_BY_LOCALE[supportedLocale][subdirKey]);
			if (!candidate || candidates.includes(candidate)) {
				continue;
			}
			candidates.push(candidate);
		}
		return candidates;
	}

	private resolveSubdirKey(subdirName: string): NovelLibrarySubdirKey | null {
		const normalizedInput = this.normalizeVaultPath(subdirName).toLowerCase();
		if (!normalizedInput) {
			return null;
		}

		for (const subdirKey of NOVEL_LIBRARY_SUBDIR_KEYS) {
			if (normalizedInput === subdirKey.toLowerCase()) {
				return subdirKey;
			}
			for (const supportedLocale of Object.keys(NOVEL_LIBRARY_SUBDIR_NAMES_BY_LOCALE) as SupportedLocale[]) {
				const localizedName = this.normalizeVaultPath(NOVEL_LIBRARY_SUBDIR_NAMES_BY_LOCALE[supportedLocale][subdirKey]).toLowerCase();
				if (normalizedInput === localizedName) {
					return subdirKey;
				}
			}
		}
		return null;
	}

	private resolveCompatibleSubdirPath(
		featureRootPath: string,
		locale: SupportedLocale,
		subdirKey: NovelLibrarySubdirKey,
	): string {
		const subdirCandidates = this.resolveNovelLibrarySubdirNameCandidates(locale, subdirKey)
			.map((subdirName) => this.normalizeVaultPath(`${featureRootPath}/${subdirName}`))
			.filter((path) => path.length > 0);
		const existingPath = this.resolveExistingFolderPath(subdirCandidates);
		if (existingPath) {
			return existingPath;
		}

		const preferredSubdirName = this.resolveNovelLibrarySubdirName(locale, subdirKey);
		return this.normalizeVaultPath(`${featureRootPath}/${preferredSubdirName}`);
	}

	private resolveBestExistingFeatureRootPath(candidateFeatureRootPaths: string[], locale: SupportedLocale): string | null {
		const existingFeatureRootPaths = candidateFeatureRootPaths.filter((path) => this.isExistingFolderPath(path));
		if (existingFeatureRootPaths.length === 0) {
			return null;
		}
		if (existingFeatureRootPaths.length === 1) {
			return existingFeatureRootPaths[0] ?? null;
		}

		let bestPath = existingFeatureRootPaths[0] ?? null;
		let bestScore = bestPath ? this.countExistingSubdirsInFeatureRoot(bestPath, locale) : -1;
		for (const candidatePath of existingFeatureRootPaths.slice(1)) {
			const score = this.countExistingSubdirsInFeatureRoot(candidatePath, locale);
			if (score > bestScore) {
				bestPath = candidatePath;
				bestScore = score;
			}
		}
		return bestPath;
	}

	private countExistingSubdirsInFeatureRoot(featureRootPath: string, locale: SupportedLocale): number {
		let count = 0;
		for (const subdirKey of NOVEL_LIBRARY_SUBDIR_KEYS) {
			const subdirCandidates = this.resolveNovelLibrarySubdirNameCandidates(locale, subdirKey)
				.map((subdirName) => this.normalizeVaultPath(`${featureRootPath}/${subdirName}`))
				.filter((path) => path.length > 0);
			if (this.resolveExistingFolderPath(subdirCandidates)) {
				count += 1;
			}
		}
		return count;
	}

	private resolveExistingFolderPath(paths: string[]): string | null {
		for (const path of paths) {
			if (this.isExistingFolderPath(path)) {
				return path;
			}
		}
		return null;
	}

	private isExistingFolderPath(path: string): boolean {
		if (!path) {
			return false;
		}
		const entry = this.app.vault.getAbstractFileByPath(path);
		return entry instanceof TFolder;
	}
}
