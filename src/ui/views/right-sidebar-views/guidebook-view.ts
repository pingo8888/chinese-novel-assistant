import type { RightSidebarViewRenderContext } from "./types";
import { MarkdownView, setIcon, TFile } from "obsidian";
import { UI } from "../../../constants";
import { NovelLibraryService } from "../../../services/novel-library-service";
import { ToggleButtonComponent } from "../../componets/toggle-button";
import { createGuidebookTreeViewComponent } from "./guidebook-tree";

let cachedMarkdownFilePath: string | null = null;

export function renderRightSidebarGuidebookView(containerEl: HTMLElement, ctx: RightSidebarViewRenderContext): () => void {
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
	const treeView = createGuidebookTreeViewComponent(scrollEl);
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

		treeView.renderData(treeData, ctx.t("feature.right_sidebar.guidebook.tree.empty"));
		treeView.setAllExpanded(toggleButton.getState());
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

	const vaultEventRefs = [
		ctx.app.vault.on("modify", (file) => {
			if (isMarkdownFile(file)) {
				scheduleRefresh();
			}
		}),
		ctx.app.vault.on("create", (file) => {
			if (isMarkdownFile(file)) {
				scheduleRefresh();
			}
		}),
		ctx.app.vault.on("delete", (file) => {
			if (isMarkdownFile(file)) {
				scheduleRefresh();
			}
		}),
		ctx.app.vault.on("rename", (file) => {
			if (isMarkdownFile(file)) {
				scheduleRefresh();
			}
		}),
	];

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
		for (const eventRef of vaultEventRefs) {
			ctx.app.vault.offref(eventRef);
		}
		disposeSettingsChange?.();
	};
}

function resolveCurrentNovelLibraryName(
	ctx: RightSidebarViewRenderContext,
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

function resolveActiveMarkdownFilePath(ctx: RightSidebarViewRenderContext): string | null {
	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	return activeView?.file?.path ?? null;
}

function isMarkdownFile(file: unknown): file is TFile {
	return file instanceof TFile && file.extension === "md";
}
