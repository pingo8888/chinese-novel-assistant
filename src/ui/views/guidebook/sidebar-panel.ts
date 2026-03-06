import type { SidebarViewRenderContext } from "./types";
import { MarkdownView, setIcon, TFile } from "obsidian";
import { UI } from "../../../constants";
import { NovelLibraryService } from "../../../services/novel-library-service";
import { watchVaultChanges } from "../../../services/vault-change-watcher";
import { ToggleButtonComponent } from "../../componets/toggle-button";
import { createGuidebookTreeViewComponent } from "./outline-tree";
import type { GuidebookTreeData } from "../../../features/guidebook/tree-builder";
import {
	handleGuidebookBlankCreateCollection,
	handleGuidebookFileContextAction,
	handleGuidebookH1ContextAction,
	handleGuidebookH2ContextAction,
} from "../../../features/guidebook/menu-actions";

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
					{ app: ctx.app, t: (key) => ctx.t(key), treeData: latestTreeData },
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
					{ app: ctx.app, t: (key) => ctx.t(key), treeData: latestTreeData },
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
					{ app: ctx.app, t: (key) => ctx.t(key), treeData: latestTreeData },
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
				});
				if (changed) {
					void refreshGuidebook();
				}
			})();
		},
	});
	const toggleButton = new ToggleButtonComponent({
		containerEl: headerEl,
		className: "cna-right-sidebar-guidebook__toggle-button",
		onIcon: UI.icon.collapse,
		offIcon: UI.icon.expand,
		onTooltip: ctx.t("feature.right_sidebar.guidebook.action.collapse_all"),
		offTooltip: ctx.t("feature.right_sidebar.guidebook.action.expand_all"),
		initialOn: true,
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

	const refreshGuidebook = async (preferredFilePath?: string | null): Promise<void> => {
		const nextFilePath = preferredFilePath ?? resolveActiveMarkdownFilePath(ctx) ?? lastMarkdownFilePath ?? cachedMarkdownFilePath;
		if (nextFilePath) {
			lastMarkdownFilePath = nextFilePath;
			cachedMarkdownFilePath = nextFilePath;
		}
		titleTextEl.setText(resolveCurrentNovelLibraryName(ctx, novelLibraryService, nextFilePath));
		const currentSeq = ++refreshSeq;
		treeView.renderLoading(ctx.t("feature.right_sidebar.guidebook.tree.loading"));

		const treeData = (await ctx.loadGuidebookTreeData?.(nextFilePath ?? null)) ?? null;
		if (isDisposed || currentSeq !== refreshSeq) {
			return;
		}
		latestTreeData = treeData;

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
			void refreshGuidebook(file?.path ?? null);
		}),
		ctx.app.workspace.on("active-leaf-change", (leaf) => {
			const markdownView = leaf?.view;
			if (!(markdownView instanceof MarkdownView)) {
				return;
			}
			void refreshGuidebook(markdownView.file?.path ?? null);
		}),
	];

	const disposeVaultWatcher = watchVaultChanges(ctx.app, (event) => {
		if (isMarkdownFile(event.file)) {
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
