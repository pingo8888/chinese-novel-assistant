import { type App, type Plugin } from "obsidian";
import { buildGuidebookTreeData } from "../features/guidebook/tree-builder";
import type { ChineseNovelAssistantSettings } from "../settings/settings";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "./novel-library-service";
import { bindVaultChangeWatcher } from "./vault-change-watcher";

export interface GuidebookQuickInsertCandidate {
	keyword: string;
	keywordLower: string;
}

interface GuidebookQuickInsertSnapshot {
	candidates: readonly GuidebookQuickInsertCandidate[];
}

interface QueryGuidebookQuickInsertOptions {
	settings: Pick<
		ChineseNovelAssistantSettings,
		"locale" | "novelLibraries" | "guidebookCollectionOrders"
	>;
	filePath: string;
	query: string;
}

export class GuidebookQuickInsertService {
	private static readonly INSTANCES = new WeakMap<App, GuidebookQuickInsertService>();

	private readonly app: App;
	private readonly novelLibraryService: NovelLibraryService;
	private initialized = false;
	private snapshots = new Map<string, GuidebookQuickInsertSnapshot>();
	private pendingSnapshots = new Map<string, Promise<GuidebookQuickInsertSnapshot>>();

	private constructor(app: App) {
		this.app = app;
		this.novelLibraryService = new NovelLibraryService(app);
	}

	static getInstance(app: App): GuidebookQuickInsertService {
		const existing = GuidebookQuickInsertService.INSTANCES.get(app);
		if (existing) {
			return existing;
		}
		const created = new GuidebookQuickInsertService(app);
		GuidebookQuickInsertService.INSTANCES.set(app, created);
		return created;
	}

	bindVaultEvents(plugin: Plugin, getSettings: () => ChineseNovelAssistantSettings): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;

		const onChangedPath = (path: string, oldPath?: string): void => {
			const settings = getSettings();
			const affectedLibraryRoots = new Set<string>();
			this.tryCollectGuidebookLibraryRoot(path, settings, affectedLibraryRoots);
			this.tryCollectGuidebookLibraryRoot(oldPath ?? "", settings, affectedLibraryRoots);
			for (const libraryRoot of affectedLibraryRoots) {
				this.invalidateByLibraryRoot(settings, libraryRoot);
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
		this.pendingSnapshots.clear();
	}

	async queryGuidebookCandidates(options: QueryGuidebookQuickInsertOptions): Promise<GuidebookQuickInsertCandidate[]> {
		const normalizedQuery = options.query.trim().toLowerCase();
		if (!normalizedQuery) {
			return [];
		}

		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(options.settings.novelLibraries);
		const libraryRoot = this.novelLibraryService.resolveContainingLibraryRoot(options.filePath, normalizedLibraryRoots);
		if (!libraryRoot) {
			return [];
		}

		const snapshot = await this.ensureSnapshot(options.settings, options.filePath, libraryRoot);
		return snapshot.candidates
			.filter((candidate) => candidate.keywordLower.includes(normalizedQuery))
			.slice()
			.sort((left, right) => this.compareByQuery(left, right, normalizedQuery));
	}

	private async ensureSnapshot(
		settings: QueryGuidebookQuickInsertOptions["settings"],
		filePath: string,
		libraryRoot: string,
	): Promise<GuidebookQuickInsertSnapshot> {
		const cacheKey = this.createCacheKey(settings, libraryRoot);
		const cached = this.snapshots.get(cacheKey);
		if (cached) {
			return cached;
		}

		const pending = this.pendingSnapshots.get(cacheKey);
		if (pending) {
			return pending;
		}

		const buildPromise = this.buildSnapshot(settings, filePath, libraryRoot)
			.then((built) => {
				this.snapshots.set(cacheKey, built);
				return built;
			})
			.finally(() => {
				this.pendingSnapshots.delete(cacheKey);
			});
		this.pendingSnapshots.set(cacheKey, buildPromise);
		return buildPromise;
	}

	private async buildSnapshot(
		settings: QueryGuidebookQuickInsertOptions["settings"],
		filePath: string,
		libraryRoot: string,
	): Promise<GuidebookQuickInsertSnapshot> {
		const treeData = await buildGuidebookTreeData(this.app, settings, filePath);
		if (!treeData || treeData.libraryRootPath !== libraryRoot) {
			return {
				candidates: [],
			};
		}

		const candidateByKeyword = new Map<string, GuidebookQuickInsertCandidate>();
		for (const fileNode of treeData.files) {
			for (const h1Node of fileNode.h1List) {
				for (const h2Node of h1Node.h2List) {
					const keyword = h2Node.title.trim();
						if (!keyword || candidateByKeyword.has(keyword)) {
							continue;
						}
						candidateByKeyword.set(keyword, {
							keyword,
							keywordLower: keyword.toLowerCase(),
						});
					}
				}
			}

		return {
			candidates: Array.from(candidateByKeyword.values()),
		};
	}

	private tryCollectGuidebookLibraryRoot(
		path: string,
		settings: Pick<ChineseNovelAssistantSettings, "locale" | "novelLibraries">,
		target: Set<string>,
	): void {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		if (!normalizedPath || !normalizedPath.toLowerCase().endsWith(".md")) {
			return;
		}

		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
		const libraryRoot = this.novelLibraryService.resolveContainingLibraryRoot(normalizedPath, normalizedLibraryRoots);
		if (!libraryRoot) {
			return;
		}

		const guidebookRoot = this.novelLibraryService.resolveNovelLibrarySubdirPath(
			{ locale: settings.locale },
			libraryRoot,
			NOVEL_LIBRARY_SUBDIR_NAMES.guidebook,
		);
		if (!guidebookRoot) {
			return;
		}
		if (this.novelLibraryService.isSameOrChildPath(normalizedPath, guidebookRoot)) {
			target.add(libraryRoot);
		}
	}

	private invalidateByLibraryRoot(
		settings: Pick<ChineseNovelAssistantSettings, "locale">,
		libraryRoot: string,
	): void {
		const key = this.createCacheKey(settings, libraryRoot);
		this.snapshots.delete(key);
		this.pendingSnapshots.delete(key);
	}

	private createCacheKey(
		settings: Pick<ChineseNovelAssistantSettings, "locale">,
		normalizedLibraryPath: string,
	): string {
		const normalizedGuidebookDirName = this.novelLibraryService.normalizeVaultPath(NOVEL_LIBRARY_SUBDIR_NAMES.guidebook);
		return `${settings.locale}::${normalizedLibraryPath}::${normalizedGuidebookDirName}`;
	}

	private compareByQuery(left: GuidebookQuickInsertCandidate, right: GuidebookQuickInsertCandidate, query: string): number {
		const leftIndex = left.keywordLower.indexOf(query);
		const rightIndex = right.keywordLower.indexOf(query);
		if (leftIndex !== rightIndex) {
			return leftIndex - rightIndex;
		}
		if (left.keyword.length !== right.keyword.length) {
			return left.keyword.length - right.keyword.length;
		}
		return left.keyword.localeCompare(right.keyword);
	}
}
