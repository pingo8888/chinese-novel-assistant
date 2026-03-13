import { App, TFolder } from "obsidian";
import type { SettingDatas } from "../core/setting-datas";

const NOVEL_LIBRARY_FEATURE_DIR_NAME = "00_功能库";

export const NOVEL_LIBRARY_SUBDIR_NAMES = {
	guidebook: "设定库",
	stickyNote: "便签库",
	snippet: "片段库",
	proofreadDictionary: "纠错词库",
} as const;

type NovelLibrarySubdirKey = keyof typeof NOVEL_LIBRARY_SUBDIR_NAMES;
const NOVEL_LIBRARY_SUBDIR_KEYS = Object.keys(NOVEL_LIBRARY_SUBDIR_NAMES) as NovelLibrarySubdirKey[];

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

	resolveNovelLibrarySubdirPaths(_settings: Pick<SettingDatas, "locale">, libraryPath: string): string[] {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return [];
		}
		const featureRootPath = this.resolveFeatureRootPath(normalizedLibraryPath);
		if (!featureRootPath) {
			return [];
		}

		return NOVEL_LIBRARY_SUBDIR_KEYS
			.map((subdirKey) => this.normalizeVaultPath(`${featureRootPath}/${NOVEL_LIBRARY_SUBDIR_NAMES[subdirKey]}`))
			.filter((path) => path.length > 0);
	}

	resolveNovelLibrarySubdirPath(
		_settings: Pick<SettingDatas, "locale">,
		libraryPath: string,
		subdirName: string,
	): string {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		const normalizedSubdirName = this.normalizeVaultPath(subdirName);
		if (!normalizedLibraryPath || !normalizedSubdirName) {
			return "";
		}
		const featureRootPath = this.resolveFeatureRootPath(normalizedLibraryPath);
		if (!featureRootPath) {
			return "";
		}

		const resolvedSubdirName = this.resolveSubdirName(normalizedSubdirName);
		return this.normalizeVaultPath(`${featureRootPath}/${resolvedSubdirName}`);
	}

	resolveNovelLibraryFeatureRootPath(_settings: Pick<SettingDatas, "locale">, libraryPath: string): string {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return "";
		}
		return this.resolveFeatureRootPath(normalizedLibraryPath);
	}

	async ensureNovelLibraryStructure(_settings: Pick<SettingDatas, "locale">, libraryPath: string): Promise<void> {
		const normalizedLibraryPath = this.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return;
		}

		await this.ensureFolderPath(normalizedLibraryPath);
		const featureRootPath = this.resolveFeatureRootPath(normalizedLibraryPath);
		if (!featureRootPath) {
			return;
		}
		await this.ensureFolderPath(featureRootPath);
		for (const subdirKey of NOVEL_LIBRARY_SUBDIR_KEYS) {
			await this.ensureFolderPath(
				this.normalizeVaultPath(`${featureRootPath}/${NOVEL_LIBRARY_SUBDIR_NAMES[subdirKey]}`),
			);
		}
	}

	private resolveFeatureRootPath(normalizedLibraryPath: string): string {
		if (!normalizedLibraryPath) {
			return "";
		}
		return this.normalizeVaultPath(`${normalizedLibraryPath}/${NOVEL_LIBRARY_FEATURE_DIR_NAME}`);
	}

	private resolveSubdirName(subdirName: string): string {
		const normalizedInput = this.normalizeVaultPath(subdirName);
		const normalizedInputLower = normalizedInput.toLowerCase();
		if (!normalizedInputLower) {
			return "";
		}

		for (const subdirKey of NOVEL_LIBRARY_SUBDIR_KEYS) {
			if (normalizedInputLower === subdirKey.toLowerCase()) {
				return NOVEL_LIBRARY_SUBDIR_NAMES[subdirKey];
			}
		}
		return normalizedInput;
	}

	async ensureFolderPath(path: string): Promise<void> {
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
