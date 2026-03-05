import { EditorView, type ViewUpdate } from "@codemirror/view";
import { MarkdownView, Plugin, TFile } from "obsidian";
import type { PluginContext } from "../../core/context";
import type { ChineseNovelAssistantSettings } from "../../settings/settings";
import { NovelLibraryService } from "../../services/novel-library-service";
import { bindVaultChangeWatcher } from "../../services/vault-change-watcher";
import { countMarkdownCharacters, hasExcalidrawFrontmatter } from "./count-engine";

const FOLDER_BADGE_CLASS = "cna-character-count-folder-badge";
const FILE_BADGE_CLASS = "cna-character-count-file-badge";

interface FolderStats {
	fileCount: number;
	charCount: number;
}

interface CountScope {
	limitToNovelLibraries: boolean;
	libraryRoots: string[];
	excludedRootsByLibrary: Map<string, string[]>;
}

export function registerCharacterCountFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new CharacterCountFeature(plugin, ctx);
	feature.onload();
}

class CharacterCountFeature {
	private plugin: Plugin;
	private ctx: PluginContext;
	private novelLibraryService: NovelLibraryService;
	private statusBarEl: HTMLElement;

	private totalCharCount = 0;
	private folderStats = new Map<string, FolderStats>();
	private fileCharCounts = new Map<string, number>();

	private rebuildTimer: number | null = null;
	private statusTimer: number | null = null;
	private badgeTimer: number | null = null;

	private isRebuilding = false;
	private hasPendingRebuild = false;
	private isUnloaded = false;

	private badgeObserver: MutationObserver | null = null;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
		this.novelLibraryService = new NovelLibraryService(plugin.app);
		this.statusBarEl = this.plugin.addStatusBarItem();
		this.statusBarEl.addClass("cna-character-count-status");
	}

	onload(): void {
		bindVaultChangeWatcher(this.plugin, this.plugin.app, () => {
			this.scheduleRebuild();
		});

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("editor-change", () => {
				this.scheduleStatusBarRender();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", () => {
				this.scheduleStatusBarRender();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.scheduleStatusBarRender();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.scheduleFolderBadgeRender();
			}),
		);

		this.plugin.registerEditorExtension(
			EditorView.updateListener.of((update: ViewUpdate) => {
				if (update.selectionSet || update.focusChanged) {
					this.scheduleStatusBarRender();
				}
			}),
		);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.scheduleRebuild();
			this.scheduleStatusBarRender();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});

		this.observeFileExplorerDom();

		this.plugin.register(() => {
			this.isUnloaded = true;
			this.clearTimers();
			this.badgeObserver?.disconnect();
			this.badgeObserver = null;
			this.clearFolderBadges();
		});

		this.scheduleRebuild();
		this.scheduleStatusBarRender();
	}

	private observeFileExplorerDom(): void {
		const workspaceContainerEl = (this.plugin.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl ?? document.body;
		this.badgeObserver = new MutationObserver(() => {
			this.scheduleFolderBadgeRender();
		});
		this.badgeObserver.observe(workspaceContainerEl, {
			childList: true,
			subtree: true,
		});
	}

	private clearTimers(): void {
		if (this.rebuildTimer !== null) {
			window.clearTimeout(this.rebuildTimer);
			this.rebuildTimer = null;
		}
		if (this.statusTimer !== null) {
			window.clearTimeout(this.statusTimer);
			this.statusTimer = null;
		}
		if (this.badgeTimer !== null) {
			window.clearTimeout(this.badgeTimer);
			this.badgeTimer = null;
		}
	}

	private scheduleRebuild(): void {
		if (this.isUnloaded) {
			return;
		}

		if (this.rebuildTimer !== null) {
			window.clearTimeout(this.rebuildTimer);
		}

		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = null;
			void this.rebuildAllStats();
		}, 250);
	}

	private scheduleStatusBarRender(): void {
		if (this.isUnloaded) {
			return;
		}

		if (this.statusTimer !== null) {
			window.clearTimeout(this.statusTimer);
		}

		this.statusTimer = window.setTimeout(() => {
			this.statusTimer = null;
			this.renderStatusBar();
		}, 60);
	}

	private scheduleFolderBadgeRender(): void {
		if (this.isUnloaded) {
			return;
		}

		if (this.badgeTimer !== null) {
			window.clearTimeout(this.badgeTimer);
		}

		this.badgeTimer = window.setTimeout(() => {
			this.badgeTimer = null;
			this.renderFolderBadges();
		}, 100);
	}

	private async rebuildAllStats(): Promise<void> {
		if (this.isRebuilding) {
			this.hasPendingRebuild = true;
			return;
		}

		this.isRebuilding = true;
		try {
			do {
				this.hasPendingRebuild = false;
				await this.rebuildAllStatsOnce();
			} while (this.hasPendingRebuild && !this.isUnloaded);
		} finally {
			this.isRebuilding = false;
		}
	}

	private async rebuildAllStatsOnce(): Promise<void> {
		const settings = this.ctx.settings;
		if (!settings.enableCharacterCount) {
			this.totalCharCount = 0;
			this.folderStats.clear();
			this.fileCharCounts.clear();
			this.renderStatusBar();
			this.clearFolderBadges();
			return;
		}

		const scope = this.buildScope(settings);
		const folderStats = new Map<string, FolderStats>();
		const fileCharCounts = new Map<string, number>();
		let totalCharCount = 0;

		const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			const normalizedPath = this.novelLibraryService.normalizeVaultPath(file.path);
			const associatedLibraryRoot = this.findLibraryRoot(normalizedPath, scope.libraryRoots);
			if (associatedLibraryRoot && this.isExcludedPath(normalizedPath, associatedLibraryRoot, scope.excludedRootsByLibrary)) {
				continue;
			}

			let boundaryRoot: string | null = null;
			if (scope.limitToNovelLibraries) {
				boundaryRoot = associatedLibraryRoot;
				if (!boundaryRoot) {
					continue;
				}
			}

			const content = await this.plugin.app.vault.cachedRead(file);
			const charCount = hasExcalidrawFrontmatter(content) ? 0 : countMarkdownCharacters(content);
			totalCharCount += charCount;
			fileCharCounts.set(normalizedPath, charCount);

			this.accumulateFileToFolderStats(file, boundaryRoot, charCount, folderStats);
		}

		this.totalCharCount = totalCharCount;
		this.folderStats = folderStats;
		this.fileCharCounts = fileCharCounts;
		this.renderStatusBar();
		this.renderFolderBadges();
	}

	private buildScope(settings: ChineseNovelAssistantSettings): CountScope {
		const libraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);

		const excludedRootsByLibrary = new Map<string, string[]>();
		for (const libraryRoot of libraryRoots) {
			const excludedRoots = this.novelLibraryService.resolveNovelLibrarySubdirPaths(settings, libraryRoot);
			excludedRootsByLibrary.set(libraryRoot, excludedRoots);
		}

		return {
			limitToNovelLibraries: settings.countOnlyNovelLibrary,
			libraryRoots,
			excludedRootsByLibrary,
		};
	}

	private findLibraryRoot(path: string, libraryRoots: string[]): string | null {
		return this.novelLibraryService.resolveContainingLibraryRoot(path, libraryRoots);
	}

	private isExcludedPath(path: string, libraryRoot: string, excludedRootsByLibrary: Map<string, string[]>): boolean {
		const excludedRoots = excludedRootsByLibrary.get(libraryRoot) ?? [];
		return excludedRoots.some((excludedRoot) => this.novelLibraryService.isSameOrChildPath(path, excludedRoot));
	}

	private accumulateFileToFolderStats(
		file: TFile,
		boundaryRoot: string | null,
		charCount: number,
		folderStats: Map<string, FolderStats>,
	): void {
		let currentFolderPath = this.novelLibraryService.normalizeVaultPath(file.parent?.path ?? "");
		while (currentFolderPath.length > 0) {
			if (boundaryRoot && !this.novelLibraryService.isSameOrChildPath(currentFolderPath, boundaryRoot)) {
				break;
			}

			const currentStats = folderStats.get(currentFolderPath) ?? {
				fileCount: 0,
				charCount: 0,
			};
			currentStats.fileCount += 1;
			currentStats.charCount += charCount;
			folderStats.set(currentFolderPath, currentStats);

			if (boundaryRoot && currentFolderPath === boundaryRoot) {
				break;
			}
			currentFolderPath = this.getParentPath(currentFolderPath);
		}
	}

	private getParentPath(path: string): string {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const index = normalizedPath.lastIndexOf("/");
		if (index < 0) {
			return "";
		}
		return normalizedPath.slice(0, index);
	}

	private renderStatusBar(): void {
		if (!this.ctx.settings.enableCharacterCount) {
			this.statusBarEl.style.display = "none";
			this.statusBarEl.setText("");
			return;
		}

		this.statusBarEl.style.display = "";
		const charUnit = this.ctx.t("feature.character_count.unit.char");
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			this.statusBarEl.setText("");
			return;
		}

		const fullContent = view.editor.getValue();
		const isExcalidrawFile = hasExcalidrawFrontmatter(fullContent);
		const totalCount = isExcalidrawFile ? 0 : countMarkdownCharacters(fullContent);
		const totalText = totalCount.toLocaleString();
		const selection = view?.editor?.getSelection() ?? "";

		if (selection.length > 0) {
			const selectionCount = (isExcalidrawFile ? 0 : countMarkdownCharacters(selection)).toLocaleString();
			this.statusBarEl.setText(`${selectionCount}${charUnit} / ${totalText}${charUnit}`);
			return;
		}

		this.statusBarEl.setText(`${totalText}${charUnit}`);
	}

	private renderFolderBadges(): void {
		if (!this.ctx.settings.enableCharacterCount) {
			this.clearFolderBadges();
			return;
		}

		const scope = this.buildScope(this.ctx.settings);
		const chapterUnit = this.ctx.t("feature.character_count.unit.chapter");
		const explorerContainers = this.getFileExplorerContainers();
		for (const containerEl of explorerContainers) {
			const folderTitleEls = Array.from(containerEl.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]"));
			for (const folderTitleEl of folderTitleEls) {
				const pathAttr = folderTitleEl.getAttribute("data-path");
				if (!pathAttr) {
					this.removeFolderBadge(folderTitleEl);
					continue;
				}

				const normalizedFolderPath = this.novelLibraryService.normalizeVaultPath(pathAttr);
				if (!normalizedFolderPath) {
					this.removeFolderBadge(folderTitleEl);
					continue;
				}

				const libraryRoot = this.findLibraryRoot(normalizedFolderPath, scope.libraryRoots);
				if (scope.limitToNovelLibraries && !libraryRoot) {
					this.removeFolderBadge(folderTitleEl);
					continue;
				}
				if (libraryRoot && this.isExcludedPath(normalizedFolderPath, libraryRoot, scope.excludedRootsByLibrary)) {
					this.removeFolderBadge(folderTitleEl);
					continue;
				}

				const stats = this.folderStats.get(normalizedFolderPath);
				if (!stats || stats.fileCount <= 0) {
					this.removeFolderBadge(folderTitleEl);
					continue;
				}

				this.upsertFolderBadge(folderTitleEl, `${stats.fileCount}${chapterUnit} | ${this.formatCharacterCount(stats.charCount)}`);
			}

			const fileTitleEls = Array.from(containerEl.querySelectorAll<HTMLElement>(".nav-file-title[data-path]"));
			for (const fileTitleEl of fileTitleEls) {
				const pathAttr = fileTitleEl.getAttribute("data-path");
				if (!pathAttr) {
					this.removeFileBadge(fileTitleEl);
					continue;
				}

				const normalizedFilePath = this.novelLibraryService.normalizeVaultPath(pathAttr);
				const fileCharCount = this.fileCharCounts.get(normalizedFilePath);
				if (fileCharCount === undefined) {
					this.removeFileBadge(fileTitleEl);
					continue;
				}

				this.upsertFileBadge(fileTitleEl, this.formatCharacterCount(fileCharCount));
			}
		}
	}

	private formatCharacterCount(charCount: number): string {
		const charUnit = this.ctx.t("feature.character_count.unit.char");
		const tenThousandUnit = this.ctx.t("feature.character_count.unit.ten_thousand");
		if (charCount >= 10000) {
			return `${(charCount / 10000).toFixed(1)}${tenThousandUnit}`;
		}
		return `${charCount}${charUnit}`;
	}

	private getFileExplorerContainers(): HTMLElement[] {
		const leaves = this.plugin.app.workspace.getLeavesOfType("file-explorer");
		const containers: HTMLElement[] = [];
		for (const leaf of leaves) {
			const containerEl = (leaf.view as unknown as { containerEl?: HTMLElement }).containerEl;
			if (containerEl) {
				containers.push(containerEl);
			}
		}
		return containers;
	}

	private upsertFolderBadge(folderTitleEl: HTMLElement, text: string): void {
		this.upsertBadge(folderTitleEl, FOLDER_BADGE_CLASS, text);
	}

	private upsertFileBadge(fileTitleEl: HTMLElement, text: string): void {
		this.upsertBadge(fileTitleEl, FILE_BADGE_CLASS, text);
	}

	private upsertBadge(containerEl: HTMLElement, badgeClass: string, text: string): void {
		let flairOuterEl = containerEl.querySelector<HTMLElement>(".tree-item-flair-outer");
		if (!flairOuterEl) {
			flairOuterEl = containerEl.createDiv({ cls: "tree-item-flair-outer" });
		}

		let badgeEl = flairOuterEl.querySelector<HTMLElement>(`.${badgeClass}`);
		if (!badgeEl) {
			badgeEl = flairOuterEl.createSpan({ cls: `tree-item-flair cna-character-count-badge ${badgeClass}` });
		}
		badgeEl.setText(text);
	}

	private removeFolderBadge(folderTitleEl: HTMLElement): void {
		const badgeEl = folderTitleEl.querySelector<HTMLElement>(`.${FOLDER_BADGE_CLASS}`);
		badgeEl?.remove();
	}

	private removeFileBadge(fileTitleEl: HTMLElement): void {
		const badgeEl = fileTitleEl.querySelector<HTMLElement>(`.${FILE_BADGE_CLASS}`);
		badgeEl?.remove();
	}

	private clearFolderBadges(): void {
		const explorerContainers = this.getFileExplorerContainers();
		for (const containerEl of explorerContainers) {
			const badgeEls = Array.from(
				containerEl.querySelectorAll<HTMLElement>(`.${FOLDER_BADGE_CLASS}, .${FILE_BADGE_CLASS}`),
			);
			for (const badgeEl of badgeEls) {
				badgeEl.remove();
			}
		}
	}
}
