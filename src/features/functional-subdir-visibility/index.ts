import { Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import type { ChineseNovelAssistantSettings } from "../../settings/settings";
import { NovelLibraryService } from "../../services/novel-library-service";

const HIDDEN_TREE_ITEM_CLASS = "cna-functional-subdir-hidden";

export function registerFunctionalSubdirVisibilityFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new FunctionalSubdirVisibilityFeature(plugin, ctx);
	feature.onload();
}

class FunctionalSubdirVisibilityFeature {
	private plugin: Plugin;
	private ctx: PluginContext;
	private novelLibraryService: NovelLibraryService;

	private renderTimer: number | null = null;
	private observer: MutationObserver | null = null;
	private isUnloaded = false;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
		this.novelLibraryService = new NovelLibraryService(plugin.app);
	}

	onload(): void {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.scheduleApply();
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("create", () => {
				this.scheduleApply();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", () => {
				this.scheduleApply();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", () => {
				this.scheduleApply();
			}),
		);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.scheduleApply();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});

		this.observeExplorerDom();

		this.plugin.register(() => {
			this.isUnloaded = true;
			if (this.renderTimer !== null) {
				window.clearTimeout(this.renderTimer);
				this.renderTimer = null;
			}
			this.observer?.disconnect();
			this.observer = null;
			this.clearHiddenClasses();
		});

		this.scheduleApply();
	}

	private observeExplorerDom(): void {
		const workspaceContainerEl = (this.plugin.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl ?? document.body;
		this.observer = new MutationObserver(() => {
			this.scheduleApply();
		});
		this.observer.observe(workspaceContainerEl, {
			childList: true,
			subtree: true,
		});
	}

	private scheduleApply(): void {
		if (this.isUnloaded) {
			return;
		}

		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
		}

		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			this.applyVisibility();
		}, 100);
	}

	private applyVisibility(): void {
		const hiddenRoots = this.buildHiddenRoots(this.ctx.settings);
		const shouldHide = this.ctx.settings.hideFunctionalSubdirsInFileExplorer;
		const explorerContainers = this.getFileExplorerContainers();
		for (const containerEl of explorerContainers) {
			const titleEls = Array.from(containerEl.querySelectorAll<HTMLElement>(".nav-folder-title[data-path], .nav-file-title[data-path]"));
			for (const titleEl of titleEls) {
				const treeItemEl = titleEl.closest<HTMLElement>(".tree-item");
				if (!treeItemEl) {
					continue;
				}

				if (!shouldHide) {
					treeItemEl.classList.remove(HIDDEN_TREE_ITEM_CLASS);
					continue;
				}

				const pathAttr = titleEl.getAttribute("data-path");
				if (!pathAttr) {
					treeItemEl.classList.remove(HIDDEN_TREE_ITEM_CLASS);
					continue;
				}

				const normalizedPath = this.novelLibraryService.normalizeVaultPath(pathAttr);
				const isHidden = hiddenRoots.some((root) => this.isSameOrChildPath(normalizedPath, root));
				treeItemEl.classList.toggle(HIDDEN_TREE_ITEM_CLASS, isHidden);
			}
		}
	}

	private buildHiddenRoots(settings: ChineseNovelAssistantSettings): string[] {
		const libraryRoots = settings.novelLibraries
			.map((path) => this.novelLibraryService.normalizeVaultPath(path))
			.filter((path) => path.length > 0);
		const subdirNames = this.novelLibraryService.resolveNovelLibrarySubdirNames(settings);
		const hiddenRoots: string[] = [];
		for (const libraryRoot of libraryRoots) {
			for (const subdirName of subdirNames) {
				const root = this.novelLibraryService.normalizeVaultPath(`${libraryRoot}/${subdirName}`);
				if (root.length > 0) {
					hiddenRoots.push(root);
				}
			}
		}
		return Array.from(new Set(hiddenRoots));
	}

	private isSameOrChildPath(path: string, root: string): boolean {
		return path === root || path.startsWith(`${root}/`);
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

	private clearHiddenClasses(): void {
		const explorerContainers = this.getFileExplorerContainers();
		for (const containerEl of explorerContainers) {
			const hiddenEls = Array.from(containerEl.querySelectorAll<HTMLElement>(`.${HIDDEN_TREE_ITEM_CLASS}`));
			for (const hiddenEl of hiddenEls) {
				hiddenEl.classList.remove(HIDDEN_TREE_ITEM_CLASS);
			}
		}
	}
}

