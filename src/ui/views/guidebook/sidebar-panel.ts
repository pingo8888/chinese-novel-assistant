import type { SidebarViewRenderContext } from "../sidebar/types";
import { MarkdownView, setIcon, TFile, TFolder } from "obsidian";
import { UI } from "../../../constants";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../../services/novel-library-service";
import { type VaultChangeEvent, watchVaultChanges } from "../../../services/vault-change-watcher";
import { ToggleButtonComponent } from "../../componets/toggle-button";
import { createGuidebookTreeViewComponent, type GuidebookTreeExpandedStateSnapshot } from "./outline-tree";
import type { GuidebookTreeData } from "../../../features/guidebook/tree-builder";
import {
	handleGuidebookBlankCreateCollection,
	handleGuidebookFileContextAction,
	handleGuidebookH1ContextAction,
	handleGuidebookH2ContextAction,
} from "../../../features/guidebook/menu-actions";
import { handleGuidebookTreeDragMove } from "../../../features/guidebook/drag-sort-actions";

let cachedMarkdownFilePath: string | null = null;

export function renderGuidebookSidebarPanel(containerEl: HTMLElement, ctx: SidebarViewRenderContext): () => void {
	const rootEl = containerEl.createDiv({ cls: "cna-right-sidebar-guidebook" });
	const headerEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__header" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	const titleEl = headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__title" });
	const titleIconEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-icon" });
	setIcon(titleIconEl, UI.icon.plugin);
	const titleTextEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-text" });

	rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__divider" });
	const contentEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__content" });
	const scrollEl = contentEl.createDiv({ cls: "cna-right-sidebar-guidebook__scroll" });
	let latestTreeData: GuidebookTreeData | null = null;
	const initialSettings = ctx.getSettings();
	const rawExpandedState = initialSettings.guidebookTreeExpandedStates ?? {};
	const initialExpandedState = filterGuidebookTreeExpandedState(rawExpandedState);
	const initialAllExpanded = initialSettings.guidebookTreeAllExpanded ?? true;
	if (!areExpandedStateRecordsEqual(rawExpandedState, initialExpandedState)) {
		void ctx.setSettings({
			guidebookTreeExpandedStates: initialExpandedState,
		});
	}
	let persistExpandedStateTimer: number | null = null;
	let pendingExpandedState: GuidebookTreeExpandedStateSnapshot | null = null;
	const schedulePersistExpandedState = (snapshot: GuidebookTreeExpandedStateSnapshot): void => {
		pendingExpandedState = snapshot;
		if (persistExpandedStateTimer !== null) {
			window.clearTimeout(persistExpandedStateTimer);
		}
		persistExpandedStateTimer = window.setTimeout(() => {
			persistExpandedStateTimer = null;
			const nextSnapshot = pendingExpandedState;
			pendingExpandedState = null;
			if (!nextSnapshot) {
				return;
			}
			const settings = ctx.getSettings();
			if (
				settings.guidebookTreeAllExpanded === nextSnapshot.allExpanded &&
				areExpandedStateRecordsEqual(settings.guidebookTreeExpandedStates ?? {}, nextSnapshot.nodeExpandedState)
			) {
				return;
			}
			void ctx.setSettings({
				guidebookTreeAllExpanded: nextSnapshot.allExpanded,
				guidebookTreeExpandedStates: nextSnapshot.nodeExpandedState,
			});
		}, 120);
	};
	const treeView = createGuidebookTreeViewComponent(scrollEl, {
		menuLabels: {
			createCollection: ctx.t("feature.right_sidebar.guidebook.menu.create_collection"),
			renameCollection: ctx.t("feature.right_sidebar.guidebook.menu.rename_collection"),
			deleteCollection: ctx.t("feature.right_sidebar.guidebook.menu.delete_collection"),
			createCategory: ctx.t("feature.right_sidebar.guidebook.menu.create_category"),
			renameCategory: ctx.t("feature.right_sidebar.guidebook.menu.rename_category"),
			deleteCategory: ctx.t("feature.right_sidebar.guidebook.menu.delete_category"),
			createSetting: ctx.t("feature.right_sidebar.guidebook.menu.create_setting"),
			renameSetting: ctx.t("feature.right_sidebar.guidebook.menu.rename_setting"),
			deleteSetting: ctx.t("feature.right_sidebar.guidebook.menu.delete_setting"),
			editSetting: ctx.t("feature.right_sidebar.guidebook.menu.edit_setting"),
		},
		onFileContextAction: (action, fileNode) => {
			void (async () => {
				const changed = await handleGuidebookFileContextAction(
					{
						app: ctx.app,
						t: (key) => ctx.t(key),
						treeData: latestTreeData,
						openFileInNewTab: ctx.getSettings().openFileInNewTab,
					},
					action,
					fileNode,
				);
				if (changed) {
					void refreshGuidebook();
				}
			})();
		},
		onH1ContextAction: (action, fileNode, h1Node) => {
			void (async () => {
				const changed = await handleGuidebookH1ContextAction(
					{
						app: ctx.app,
						t: (key) => ctx.t(key),
						treeData: latestTreeData,
						openFileInNewTab: ctx.getSettings().openFileInNewTab,
					},
					action,
					fileNode,
					h1Node,
				);
				if (changed) {
					void refreshGuidebook();
				}
			})();
		},
		onH2ContextAction: (action, fileNode, h1Node, h2Node) => {
			void (async () => {
				const changed = await handleGuidebookH2ContextAction(
					{
						app: ctx.app,
						t: (key) => ctx.t(key),
						treeData: latestTreeData,
						openFileInNewTab: ctx.getSettings().openFileInNewTab,
					},
					action,
					fileNode,
					h1Node,
					h2Node,
				);
				if (changed) {
					void refreshGuidebook();
				}
			})();
		},
		onBlankContextCreateCollection: () => {
			void (async () => {
				const changed = await handleGuidebookBlankCreateCollection({
					app: ctx.app,
					t: (key) => ctx.t(key),
					treeData: latestTreeData,
					openFileInNewTab: ctx.getSettings().openFileInNewTab,
				});
				if (changed) {
					void refreshGuidebook();
				}
			})();
		},
		onMove: (request) => {
			return (async () => {
				const changed = await handleGuidebookTreeDragMove(
					{
						app: ctx.app,
						t: (key) => ctx.t(key),
						treeData: latestTreeData,
						getSettings: ctx.getSettings,
						setSettings: ctx.setSettings,
					},
					request,
				);
				if (changed) {
					void refreshGuidebook();
				}
				return changed;
			})();
			},
			initialExpandedState,
			initialAllExpanded,
			onExpandedStateChange: schedulePersistExpandedState,
		});
	const toggleButton = new ToggleButtonComponent({
		containerEl: headerEl,
		className: "cna-right-sidebar-guidebook__toggle-button",
		onIcon: UI.icon.collapse,
		offIcon: UI.icon.expand,
		onTooltip: ctx.t("feature.right_sidebar.guidebook.action.collapse_all"),
		offTooltip: ctx.t("feature.right_sidebar.guidebook.action.expand_all"),
		initialOn: initialAllExpanded,
		onToggle: (isOn) => treeView.setAllExpanded(isOn),
	});

	const novelLibraryService = new NovelLibraryService(ctx.app);
	let lastMarkdownFilePath = resolveActiveMarkdownFilePath(ctx) ?? cachedMarkdownFilePath;
	if (lastMarkdownFilePath) {
		cachedMarkdownFilePath = lastMarkdownFilePath;
	}
	let isDisposed = false;
	let refreshSeq = 0;
	let refreshTimer: number | null = null;
	let renderedTreeSignature: string | null = null;
	let hasRenderedTree = false;

	const refreshGuidebook = async (preferredFilePath?: string | null): Promise<void> => {
		const nextFilePath = preferredFilePath ?? resolveActiveMarkdownFilePath(ctx) ?? lastMarkdownFilePath ?? cachedMarkdownFilePath;
		if (nextFilePath) {
			lastMarkdownFilePath = nextFilePath;
			cachedMarkdownFilePath = nextFilePath;
		}
		titleTextEl.setText(resolveCurrentNovelLibraryName(ctx, novelLibraryService, nextFilePath));
		const currentSeq = ++refreshSeq;
		if (!hasRenderedTree) {
			treeView.renderLoading(ctx.t("feature.right_sidebar.guidebook.tree.loading"));
		}

		const treeData = (await ctx.loadGuidebookTreeData?.(nextFilePath ?? null)) ?? null;
		if (isDisposed || currentSeq !== refreshSeq) {
			return;
		}
		const treeSignature = buildGuidebookTreeSignature(treeData);
		if (hasRenderedTree && treeSignature === renderedTreeSignature) {
			return;
		}
		latestTreeData = treeData;
		renderedTreeSignature = treeSignature;
		hasRenderedTree = true;

		treeView.renderData(treeData, ctx.t("feature.right_sidebar.guidebook.tree.empty"));
	};
	const scheduleRefresh = (preferredFilePath?: string | null): void => {
		if (refreshTimer !== null) {
			window.clearTimeout(refreshTimer);
		}
		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			void refreshGuidebook(preferredFilePath);
		}, 120);
	};
	void refreshGuidebook();

	const workspaceEventRefs = [
		ctx.app.workspace.on("file-open", (file) => {
			scheduleRefresh(file?.path ?? null);
		}),
		ctx.app.workspace.on("active-leaf-change", (leaf) => {
			const markdownView = leaf?.view;
			if (!(markdownView instanceof MarkdownView)) {
				return;
			}
			scheduleRefresh(markdownView.file?.path ?? null);
		}),
	];

	const disposeVaultWatcher = watchVaultChanges(ctx.app, (event) => {
		if (event.type === "rename" && event.file instanceof TFolder) {
			if (shouldRefreshForLibraryFolderRename(event, ctx, novelLibraryService)) {
				scheduleRefresh(event.path);
			}
			return;
		}
		if (!isMarkdownFile(event.file)) {
			return;
		}
		if (shouldRefreshForVaultEvent(event, ctx, novelLibraryService, latestTreeData, lastMarkdownFilePath)) {
			scheduleRefresh();
		}
	});

	const disposeSettingsChange = ctx.onSettingsChange?.(() => {
		void refreshGuidebook();
	});

	return () => {
		isDisposed = true;
		refreshSeq += 1;
			if (refreshTimer !== null) {
				window.clearTimeout(refreshTimer);
				refreshTimer = null;
			}
			if (persistExpandedStateTimer !== null) {
				window.clearTimeout(persistExpandedStateTimer);
				persistExpandedStateTimer = null;
			}
			toggleButton.destroy();
			treeView.destroy();
		for (const eventRef of workspaceEventRefs) {
			ctx.app.workspace.offref(eventRef);
		}
		disposeVaultWatcher();
		disposeSettingsChange?.();
	};
}

function resolveCurrentNovelLibraryName(
	ctx: SidebarViewRenderContext,
	novelLibraryService: NovelLibraryService,
	filePath?: string | null,
): string {
	const activeFilePath = typeof filePath === "string" && filePath.length > 0 ? filePath : null;
	if (!activeFilePath) {
		return ctx.t("feature.right_sidebar.guidebook.current_library.none");
	}

	const settings = ctx.getSettings();
	const libraryRoots = novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
	const matchedLibraryPath = novelLibraryService.resolveContainingLibraryRoot(activeFilePath, libraryRoots);
	if (!matchedLibraryPath) {
		return ctx.t("feature.right_sidebar.guidebook.current_library.none");
	}

	const segments = matchedLibraryPath.split("/").filter((segment) => segment.length > 0);
	return segments[segments.length - 1] ?? matchedLibraryPath;
}

function resolveActiveMarkdownFilePath(ctx: SidebarViewRenderContext): string | null {
	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	return activeView?.file?.path ?? null;
}

function isMarkdownFile(file: unknown): file is TFile {
	return file instanceof TFile && file.extension === "md";
}

function shouldRefreshForVaultEvent(
	event: VaultChangeEvent,
	ctx: SidebarViewRenderContext,
	novelLibraryService: NovelLibraryService,
	latestTreeData: GuidebookTreeData | null,
	lastMarkdownFilePath: string | null,
): boolean {
	const settings = ctx.getSettings();
	const normalizedLibraryRoots = novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
	const referenceFilePath = resolveActiveMarkdownFilePath(ctx) ?? lastMarkdownFilePath ?? cachedMarkdownFilePath;
	if (!referenceFilePath) {
		return true;
	}

	const activeLibraryRoot = novelLibraryService.resolveContainingLibraryRoot(referenceFilePath, normalizedLibraryRoots);
	if (!activeLibraryRoot) {
		return false;
	}
	const guidebookRootPath =
		latestTreeData?.guidebookRootPath ||
		novelLibraryService.resolveNovelLibrarySubdirPath(
			{ locale: settings.locale },
			activeLibraryRoot,
			NOVEL_LIBRARY_SUBDIR_NAMES.guidebook,
		);
	if (!guidebookRootPath) {
		return false;
	}
	return isSameOrChildPath(event.path, guidebookRootPath) || isSameOrChildPath(event.oldPath, guidebookRootPath);
}

function shouldRefreshForLibraryFolderRename(
	event: VaultChangeEvent,
	ctx: SidebarViewRenderContext,
	novelLibraryService: NovelLibraryService,
): boolean {
	const renamedFolderPath = novelLibraryService.normalizeVaultPath(event.path);
	const previousFolderPath = novelLibraryService.normalizeVaultPath(event.oldPath ?? "");
	if (!renamedFolderPath || !previousFolderPath || renamedFolderPath === previousFolderPath) {
		return false;
	}
	const libraryRoots = novelLibraryService.normalizeLibraryRoots(ctx.getSettings().novelLibraries);
	if (libraryRoots.length === 0) {
		return false;
	}
	return libraryRoots.some((libraryRoot) =>
		novelLibraryService.isSameOrChildPath(libraryRoot, previousFolderPath) ||
		novelLibraryService.isSameOrChildPath(previousFolderPath, libraryRoot) ||
		novelLibraryService.isSameOrChildPath(libraryRoot, renamedFolderPath) ||
		novelLibraryService.isSameOrChildPath(renamedFolderPath, libraryRoot),
	);
}

function isSameOrChildPath(path: string | undefined, root: string): boolean {
	if (!path || !root) {
		return false;
	}
	return path === root || path.startsWith(`${root}/`);
}

function buildGuidebookTreeSignature(treeData: GuidebookTreeData | null): string {
	if (!treeData) {
		return "";
	}
	let signature = `${treeData.libraryRootPath}\u0000${treeData.guidebookRootPath}\u0000${treeData.files.length}`;
	for (const fileNode of treeData.files) {
		signature += `\u0001${fileNode.stableKey}\u0000${fileNode.fileName}\u0000${fileNode.h2Count}\u0000${fileNode.sourcePaths.join("\u0002")}`;
		for (const h1Node of fileNode.h1List) {
			signature += `\u0003${h1Node.h1IndexInSource}\u0000${h1Node.title}\u0000${h1Node.h2List.length}\u0000${h1Node.sourcePath}`;
			for (const h2Node of h1Node.h2List) {
				signature += `\u0004${h2Node.h1IndexInSource}\u0000${h2Node.h2IndexInH1}\u0000${h2Node.title}\u0000${h2Node.sourcePath}\u0000${h2Node.sourceFileCtime}`;
			}
		}
	}
	return signature;
}

function areExpandedStateRecordsEqual(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}
	for (const key of leftKeys) {
		if (left[key] !== right[key]) {
			return false;
		}
	}
	return true;
}

function filterGuidebookTreeExpandedState(source: Record<string, boolean>): Record<string, boolean> {
	const next: Record<string, boolean> = {};
	for (const [key, value] of Object.entries(source)) {
		if (!key.includes("::file:") && !key.includes("::h1:")) {
			continue;
		}
		next[key] = value;
	}
	return next;
}
