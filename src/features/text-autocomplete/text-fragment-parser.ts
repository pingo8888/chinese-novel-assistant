import { type App, type Plugin } from "obsidian";
import type { SettingDatas } from "../../core/setting-datas";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../services/novel-library-service";
import { bindVaultChangeWatcher } from "../../core/vault-watcher";

export interface SnippetFragment {
	keyword: string;
	content: string;
}

interface SnippetLibrarySnapshot {
	fragments: readonly SnippetFragment[];
}

interface QuerySnippetFragmentsOptions {
	settings: Pick<SettingDatas, "locale" | "novelLibraries">;
	libraryPath: string;
	query: string;
}

export class SnippetFragmentService {
	private static readonly INSTANCES = new WeakMap<App, SnippetFragmentService>();

	private app: App;
	private novelLibraryService: NovelLibraryService;
	private initialized = false;
	private snapshots = new Map<string, SnippetLibrarySnapshot>();

	private constructor(app: App) {
		this.app = app;
		this.novelLibraryService = new NovelLibraryService(app);
	}

	static getInstance(app: App): SnippetFragmentService {
		const existing = SnippetFragmentService.INSTANCES.get(app);
		if (existing) {
			return existing;
		}
		const created = new SnippetFragmentService(app);
		SnippetFragmentService.INSTANCES.set(app, created);
		return created;
	}

	bindVaultEvents(plugin: Plugin, getSettings: () => SettingDatas): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;

		const onChangedPath = (path: string, oldPath?: string): void => {
			const settings = getSettings();
			if (
				this.isSnippetMarkdownPath(path, settings) ||
				this.isSnippetMarkdownPath(oldPath ?? "", settings)
			) {
				this.invalidateAll();
			}
		};

		bindVaultChangeWatcher(plugin, this.app, (event) => {
			onChangedPath(event.path, event.oldPath);
		});

		plugin.register(() => {
			this.initialized = false;
			this.invalidateAll();
		});
	}

	invalidateAll(): void {
		this.snapshots.clear();
	}

	async querySnippetFragments(options: QuerySnippetFragmentsOptions): Promise<SnippetFragment[]> {
		const normalizedQuery = options.query.trim().toLowerCase();
		if (!normalizedQuery) {
			return [];
		}

		const snapshot = await this.ensureLibrarySnapshot(options.settings, options.libraryPath);
		return snapshot.fragments
			.filter((fragment) => fragment.keyword.toLowerCase().includes(normalizedQuery))
			.slice()
			.sort((left, right) => this.compareByQuery(left.keyword, right.keyword, normalizedQuery));
	}

	private async ensureLibrarySnapshot(
		settings: Pick<SettingDatas, "locale" | "novelLibraries">,
		libraryPath: string,
	): Promise<SnippetLibrarySnapshot> {
		const normalizedLibraryPath = this.novelLibraryService.normalizeVaultPath(libraryPath);
		if (!normalizedLibraryPath) {
			return this.createEmptySnapshot();
		}

		const cacheKey = this.createCacheKey(settings, normalizedLibraryPath);
		const cached = this.snapshots.get(cacheKey);
		if (cached) {
			return cached;
		}

		const built = await this.buildLibrarySnapshot(settings, normalizedLibraryPath);
		this.snapshots.set(cacheKey, built);
		return built;
	}

	private async buildLibrarySnapshot(
		settings: Pick<SettingDatas, "locale" | "novelLibraries">,
		libraryPath: string,
	): Promise<SnippetLibrarySnapshot> {
		const snippetRoot = this.novelLibraryService.resolveNovelLibrarySubdirPath(
			{ locale: settings.locale },
			libraryPath,
			NOVEL_LIBRARY_SUBDIR_NAMES.snippet,
		);
		if (!snippetRoot) {
			return this.createEmptySnapshot();
		}

		const fragments: SnippetFragment[] = [];
		const markdownFiles = this.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			const normalizedPath = this.novelLibraryService.normalizeVaultPath(file.path);
			if (!this.isSameOrChildPath(normalizedPath, snippetRoot)) {
				continue;
			}

			try {
				const content = await this.app.vault.cachedRead(file);
				fragments.push(...this.parseFragmentsFromMarkdown(content));
			} catch (error) {
				console.error("[Chinese Novel Assistant] Failed to read snippet file.", file.path, error);
			}
		}

		return {
			fragments,
		};
	}

	private parseFragmentsFromMarkdown(markdown: string): SnippetFragment[] {
		const fragments: SnippetFragment[] = [];
		const lines = markdown.split(/\r?\n/);
		for (let index = 0; index < lines.length; index += 1) {
			const currentLine = lines[index] ?? "";
			const headingMatch = currentLine.match(/^\s{0,3}##\s+(.+?)\s*#*\s*$/);
			if (!headingMatch) {
				continue;
			}

			const keyword = (headingMatch[1] ?? "").trim();
			if (!this.isValidKeyword(keyword)) {
				continue;
			}

			let endIndex = lines.length;
			for (let next = index + 1; next < lines.length; next += 1) {
				const line = lines[next] ?? "";
				if (/^\s{0,3}##\s+/.test(line) || /^\s{0,3}###\s+/.test(line)) {
					endIndex = next;
					break;
				}
			}

			const content = this.trimBoundaryBlankLines(lines.slice(index + 1, endIndex).join("\n"));
			if (!content) {
				index = endIndex - 1;
				continue;
			}

			fragments.push({ keyword, content });
			index = endIndex - 1;
		}

		return fragments;
	}

	private trimBoundaryBlankLines(content: string): string {
		const lines = content.split(/\r?\n/);
		let start = 0;
		let end = lines.length - 1;
		while (start <= end && (lines[start] ?? "").trim().length === 0) {
			start += 1;
		}
		while (end >= start && (lines[end] ?? "").trim().length === 0) {
			end -= 1;
		}
		return lines.slice(start, end + 1).join("\n");
	}

	private isValidKeyword(keyword: string): boolean {
		if (!keyword) {
			return false;
		}
		return !/[#\s]/.test(keyword);
	}

	private isSnippetMarkdownPath(
		path: string,
		settings: Pick<SettingDatas, "locale" | "novelLibraries">,
	): boolean {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		if (!normalizedPath || !normalizedPath.toLowerCase().endsWith(".md")) {
			return false;
		}

		const snippetRoots = this.resolveSnippetRoots(settings);
		return snippetRoots.some((root) => this.isSameOrChildPath(normalizedPath, root));
	}

	private resolveSnippetRoots(
		settings: Pick<SettingDatas, "locale" | "novelLibraries">,
	): string[] {
		const roots: string[] = [];
		for (const libraryPath of settings.novelLibraries) {
			const snippetRoot = this.novelLibraryService.resolveNovelLibrarySubdirPath(
				{ locale: settings.locale },
				libraryPath,
				NOVEL_LIBRARY_SUBDIR_NAMES.snippet,
			);
			if (!snippetRoot) {
				continue;
			}
			roots.push(snippetRoot);
		}
		return Array.from(new Set(roots));
	}

	private createCacheKey(
		settings: Pick<SettingDatas, "locale">,
		normalizedLibraryPath: string,
	): string {
		const normalizedSnippetDirName = this.novelLibraryService.normalizeVaultPath(NOVEL_LIBRARY_SUBDIR_NAMES.snippet);
		return `${settings.locale}::${normalizedLibraryPath}::${normalizedSnippetDirName}`;
	}

	private createEmptySnapshot(): SnippetLibrarySnapshot {
		return {
			fragments: [],
		};
	}

	private compareByQuery(left: string, right: string, query: string): number {
		const leftLower = left.toLowerCase();
		const rightLower = right.toLowerCase();
		const leftIndex = leftLower.indexOf(query);
		const rightIndex = rightLower.indexOf(query);
		if (leftIndex !== rightIndex) {
			return leftIndex - rightIndex;
		}
		if (left.length !== right.length) {
			return left.length - right.length;
		}
		return left.localeCompare(right);
	}

	private isSameOrChildPath(path: string, root: string): boolean {
		return path === root || path.startsWith(`${root}/`);
	}
}



