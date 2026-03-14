import { App, Plugin } from "obsidian";
import { MarkdownParseService } from "../../services/markdown-parse-service";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../services/novel-library-service";
import type { SettingDatas } from "../../core/setting-datas";
import { bindVaultChangeWatcher } from "../../core/vault-watcher";

interface ProofreadDictLineEntry {
	wrong: string;
	correct: string;
	lineNumber: number;
}

interface ProofreadDictParseResult {
	entries: ProofreadDictLineEntry[];
}

export interface ProofreadDictSnapshot {
	replacements: ReadonlyMap<string, string>;
	wrongWordsDesc: readonly string[];
	dictionaryRoots: readonly string[];
	loadedAt: number;
}

export class ProofreadDictService {
	private static readonly PARSER_ID = "proofread-dict-line";
	private static readonly REBUILD_DEBOUNCE_MS = 200;
	private static readonly INSTANCES = new WeakMap<App, ProofreadDictService>();

	private app: App;
	private markdownParseService: MarkdownParseService;
	private novelLibraryService: NovelLibraryService;

	private initialized = false;
	private rebuildTimer: number | null = null;
	private rebuildingPromise: Promise<void> | null = null;
	private pendingRebuild = false;
	private queuedSettings: SettingDatas | null = null;
	private stale = true;

	private snapshot: ProofreadDictSnapshot = {
		replacements: new Map<string, string>(),
		wrongWordsDesc: [],
		dictionaryRoots: [],
		loadedAt: 0,
	};

	private listeners = new Set<() => void>();

	private constructor(app: App) {
		this.app = app;
		this.markdownParseService = new MarkdownParseService(app);
		this.novelLibraryService = new NovelLibraryService(app);
		this.registerParsers();
	}

	static getInstance(app: App): ProofreadDictService {
		const existing = ProofreadDictService.INSTANCES.get(app);
		if (existing) {
			return existing;
		}
		const created = new ProofreadDictService(app);
		ProofreadDictService.INSTANCES.set(app, created);
		return created;
	}

	bindVaultEvents(plugin: Plugin, getSettings: () => SettingDatas): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;

		const onChangedPath = (path: string, oldPath?: string): void => {
			const settings = getSettings();
			if (!this.isDictionaryMarkdownPath(path, settings) && !this.isDictionaryMarkdownPath(oldPath ?? "", settings)) {
				return;
			}
			this.invalidate();
			this.scheduleRebuild(settings);
		};

		bindVaultChangeWatcher(plugin, this.app, (event) => {
			onChangedPath(event.path, event.oldPath);
		});

		plugin.register(() => {
			if (this.rebuildTimer !== null) {
				window.clearTimeout(this.rebuildTimer);
				this.rebuildTimer = null;
			}
			this.initialized = false;
		});
	}

	onCacheChanged(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	invalidate(): void {
		this.stale = true;
	}

	getSnapshot(): ProofreadDictSnapshot {
		return this.snapshot;
	}

	async ensureCacheReady(settings: SettingDatas): Promise<ProofreadDictSnapshot> {
		if (this.stale) {
			await this.requestRebuild(settings);
			return this.snapshot;
		}
		if (this.rebuildingPromise) {
			await this.rebuildingPromise;
		}
		return this.snapshot;
	}

	private scheduleRebuild(settings: SettingDatas): void {
		this.queuedSettings = settings;
		if (this.rebuildTimer !== null) {
			window.clearTimeout(this.rebuildTimer);
		}
		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = null;
			const latestSettings = this.queuedSettings ?? settings;
			void this.requestRebuild(latestSettings);
		}, ProofreadDictService.REBUILD_DEBOUNCE_MS);
	}

	private async requestRebuild(settings: SettingDatas): Promise<void> {
		this.queuedSettings = settings;
		this.stale = true;

		if (this.rebuildingPromise) {
			this.pendingRebuild = true;
			await this.rebuildingPromise;
			return;
		}

		this.rebuildingPromise = this.rebuildLoop();
		try {
			await this.rebuildingPromise;
		} finally {
			this.rebuildingPromise = null;
		}
	}

	private async rebuildLoop(): Promise<void> {
		do {
			this.pendingRebuild = false;
			const settings = this.queuedSettings;
			this.queuedSettings = null;
			if (!settings) {
				this.stale = false;
				continue;
			}

			const nextSnapshot = await this.buildSnapshot(settings);
			this.snapshot = nextSnapshot;
			this.stale = false;
			this.emitCacheChanged();
		} while (this.pendingRebuild);
	}

	private async buildSnapshot(settings: SettingDatas): Promise<ProofreadDictSnapshot> {
		if (!settings.proofreadCustomDictionaryEnabled) {
			return this.createEmptySnapshot();
		}

		const dictionaryRoots = this.resolveDictionaryRoots(settings);
		if (dictionaryRoots.length === 0) {
			return this.createEmptySnapshot(dictionaryRoots);
		}

		const replacements = new Map<string, string>();
		const markdownFiles = this.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			const normalizedFilePath = this.novelLibraryService.normalizeVaultPath(file.path);
			if (!this.isPathUnderRoots(normalizedFilePath, dictionaryRoots)) {
				continue;
			}

			try {
				const parsed = await this.markdownParseService.parseMarkdownFile<ProofreadDictParseResult>({
					settings: { novelLibraries: settings.novelLibraries },
					filePath: file.path,
					parserId: ProofreadDictService.PARSER_ID,
				});
				for (const entry of parsed.parsed.entries) {
					if (!entry.wrong || !entry.correct) {
						continue;
					}
					replacements.set(entry.wrong, entry.correct);
				}
			} catch (error) {
				console.error("[Chinese Novel Assistant] Failed to parse proofread dictionary file.", file.path, error);
			}
		}

		const wrongWordsDesc = Array.from(replacements.keys()).sort((a, b) => {
			if (b.length !== a.length) {
				return b.length - a.length;
			}
			return a.localeCompare(b);
		});

		return {
			replacements,
			wrongWordsDesc,
			dictionaryRoots,
			loadedAt: Date.now(),
		};
	}

	private createEmptySnapshot(dictionaryRoots: readonly string[] = []): ProofreadDictSnapshot {
		return {
			replacements: new Map<string, string>(),
			wrongWordsDesc: [],
			dictionaryRoots,
			loadedAt: Date.now(),
		};
	}

	private resolveDictionaryRoots(settings: SettingDatas): string[] {
		const roots: string[] = [];
		for (const libraryPath of settings.novelLibraries) {
			const dictionaryRoot = this.novelLibraryService.resolveNovelLibrarySubdirPath(
				{ locale: settings.locale },
				libraryPath,
				NOVEL_LIBRARY_SUBDIR_NAMES.proofreadDictionary,
			);
			if (!dictionaryRoot) {
				continue;
			}
			roots.push(dictionaryRoot);
		}
		return Array.from(new Set(roots));
	}

	private isDictionaryMarkdownPath(path: string, settings: SettingDatas): boolean {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		if (!normalizedPath || !normalizedPath.toLowerCase().endsWith(".md")) {
			return false;
		}
		const roots = this.resolveDictionaryRoots(settings);
		return this.isPathUnderRoots(normalizedPath, roots);
	}

	private isPathUnderRoots(path: string, roots: readonly string[]): boolean {
		return roots.some((root) => path === root || path.startsWith(`${root}/`));
	}

	private registerParsers(): void {
		this.markdownParseService.registerParser(
			{
				id: ProofreadDictService.PARSER_ID,
				parse: ({ content }): ProofreadDictParseResult => this.parseProofreadDictContent(content),
			},
			{ replace: true },
		);
	}

	private parseProofreadDictContent(content: string): ProofreadDictParseResult {
		const entries: ProofreadDictLineEntry[] = [];
		const lines = content.split(/\r?\n/);
		for (let index = 0; index < lines.length; index += 1) {
			const sourceLine = lines[index]?.trim() ?? "";
			if (!sourceLine) {
				continue;
			}
			const match = sourceLine.match(/^(\S+)\s+(\S+)$/);
			if (!match) {
				continue;
			}
			const wrong = match[1]?.trim() ?? "";
			const correct = match[2]?.trim() ?? "";
			if (!wrong || !correct) {
				continue;
			}

			entries.push({
				wrong,
				correct,
				lineNumber: index + 1,
			});
		}
		return { entries };
	}

	private emitCacheChanged(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}



