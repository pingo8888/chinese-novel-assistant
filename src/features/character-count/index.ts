import { Annotation, Prec } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { MarkdownView, Plugin, TFile } from "obsidian";
import type { PluginContext } from "../../core/context";
import type { SettingDatas } from "../../core/setting-datas";
import { NovelLibraryService } from "../../core/novel-library-service";
import { bindVaultChangeWatcher } from "../../core/vault-watcher";
import {
	countMarkdownCharacters,
	hasExcalidrawFrontmatter,
	resolveCharacterMilestoneLines,
} from "./count-engine";

const FOLDER_BADGE_CLASS = "cna-character-count-folder-badge";
const FILE_BADGE_CLASS = "cna-character-count-file-badge";
const CHARACTER_MILESTONE_GUTTER_CLASS = "cna-character-milestone-gutter";
const CHARACTER_MILESTONE_ENABLED_CLASS = "cna-character-milestone-enabled";
const CHARACTER_MILESTONE_FORCE_REFRESH = Annotation.define<boolean>();
const CHARACTER_MILESTONE_STEP = 500;
type MaybeEditorView = ReturnType<typeof EditorView.findFromDOM>;
type ResolvedEditorView = NonNullable<MaybeEditorView>;

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
		this.plugin.registerEditorExtension(
			createCharacterMilestoneGutterExtension(() => this.ctx.settings),
		);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.scheduleRebuild();
			this.scheduleStatusBarRender();
			this.applyMilestoneGutterVisibility();
			this.forceRefreshEditorViews();
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
			this.clearMilestoneGutterVisibility();
		});

		this.applyMilestoneGutterVisibility();
		this.scheduleRebuild();
		this.scheduleStatusBarRender();
	}

	private forceRefreshEditorViews(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				continue;
			}
			const editorView = resolveEditorViewFromMarkdownView(view);
			editorView?.dispatch({
				annotations: CHARACTER_MILESTONE_FORCE_REFRESH.of(true),
			});
		}
	}

	private observeFileExplorerDom(): void {
		const workspaceContainerEl = (this.plugin.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl ?? document.body;
		this.badgeObserver = new MutationObserver((mutations) => {
			if (!this.hasRelevantFileExplorerMutation(mutations)) {
				return;
			}
			this.scheduleFolderBadgeRender();
		});
		this.badgeObserver.observe(workspaceContainerEl, {
			childList: true,
			subtree: true,
		});
	}

	private hasRelevantFileExplorerMutation(mutations: MutationRecord[]): boolean {
		for (const mutation of mutations) {
			if (this.isNodeInsideFileExplorer(mutation.target)) {
				return true;
			}
			for (const node of Array.from(mutation.addedNodes)) {
				if (this.isNodeInsideFileExplorer(node)) {
					return true;
				}
			}
			for (const node of Array.from(mutation.removedNodes)) {
				if (this.isNodeInsideFileExplorer(node)) {
					return true;
				}
			}
		}
		return false;
	}

	private isNodeInsideFileExplorer(node: Node | null): boolean {
		if (!node) {
			return false;
		}
		const element = node instanceof HTMLElement ? node : node.parentElement;
		if (!element) {
			return false;
		}
		return Boolean(element.closest(".workspace-leaf-content[data-type='file-explorer']"));
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

	private buildScope(settings: SettingDatas): CountScope {
		const libraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);

		const excludedRootsByLibrary = new Map<string, string[]>();
		for (const libraryRoot of libraryRoots) {
			const excludedRoots = this.novelLibraryService.resolveNovelLibrarySubdirPaths(libraryRoot);
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
			this.statusBarEl.toggleClass("is-hidden", true);
			this.statusBarEl.setText("");
			return;
		}

		this.statusBarEl.toggleClass("is-hidden", false);
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

	private applyMilestoneGutterVisibility(): void {
		const rootEl = this.getRootEl();
		const settings = this.ctx.settings;
		const enabled = settings.enableCharacterCount && settings.enableCharacterMilestone;
		rootEl.classList.toggle(CHARACTER_MILESTONE_ENABLED_CLASS, enabled);
	}

	private clearMilestoneGutterVisibility(): void {
		const rootEl = this.getRootEl();
		rootEl.classList.remove(CHARACTER_MILESTONE_ENABLED_CLASS);
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
		if (badgeEl.textContent !== text) {
			badgeEl.setText(text);
		}
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

	private getRootEl(): HTMLElement {
		const workspaceContainerEl = (this.plugin.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl;
		return workspaceContainerEl ?? document.body;
	}
}

class CharacterMilestoneMarker extends GutterMarker {
	private readonly text: string;

	constructor(text: string) {
		super();
		this.text = text;
	}

	eq(other: CharacterMilestoneMarker): boolean {
		return this.text === other.text;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = "cna-character-milestone-marker";
		el.textContent = this.text;
		return el;
	}
}

function createCharacterMilestoneGutterExtension(
	getSettings: () => SettingDatas,
) {
	const milestoneByLineByView = new WeakMap<EditorView, Map<number, number>>();

	const pluginExtension = ViewPlugin.fromClass(
		class {
			private readonly view: EditorView;

			constructor(view: EditorView) {
				this.view = view;
				this.recomputeMilestones();
			}

			update(update: ViewUpdate): void {
				const forced = update.transactions.some((tr) => tr.annotation(CHARACTER_MILESTONE_FORCE_REFRESH));
				if (forced || update.docChanged) {
					this.recomputeMilestones();
				}
			}

			destroy(): void {
				milestoneByLineByView.delete(this.view);
			}

			private recomputeMilestones(): void {
				const settings = getSettings();
				if (!settings.enableCharacterCount || !settings.enableCharacterMilestone) {
					milestoneByLineByView.set(this.view, new Map());
					return;
				}
				const content = this.view.state.doc.toString();
				const milestones = resolveCharacterMilestoneLines(content, CHARACTER_MILESTONE_STEP);
				const map = new Map<number, number>();
				for (const item of milestones) {
					map.set(item.lineNumber, item.milestone);
				}
				milestoneByLineByView.set(this.view, map);
			}
		},
	);

	const gutterExtension = gutter({
		class: CHARACTER_MILESTONE_GUTTER_CLASS,
		lineMarkerChange: (update) =>
			update.docChanged ||
			update.transactions.some((tr) => tr.annotation(CHARACTER_MILESTONE_FORCE_REFRESH)),
		lineMarker: (view, line) => {
			const settings = getSettings();
			if (!settings.enableCharacterCount || !settings.enableCharacterMilestone) {
				return null;
			}
			const map = milestoneByLineByView.get(view);
			if (!map || map.size === 0) {
				return null;
			}
			const lineNumber = view.state.doc.lineAt(line.from).number;
			const milestone = map.get(lineNumber);
			if (!milestone) {
				return null;
			}
			return new CharacterMilestoneMarker(String(milestone));
		},
	});

	return [pluginExtension, Prec.low(gutterExtension)];
}

function resolveEditorViewFromMarkdownView(view: MarkdownView): MaybeEditorView {
	const editorAny = view.editor as unknown as {
		cm?: ResolvedEditorView;
		editor?: { cm?: ResolvedEditorView };
	};
	return editorAny.cm ?? editorAny.editor?.cm ?? null;
}


