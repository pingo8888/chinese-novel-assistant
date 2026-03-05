import type { RightSidebarViewRenderContext } from "./types";
import { MarkdownView, setIcon } from "obsidian";
import { UI } from "../../../constants";
import { NovelLibraryService } from "../../../services/novel-library-service";
import { ToggleButtonComponent } from "../../componets/toggle-button";

let cachedMarkdownFilePath: string | null = null;

export function renderRightSidebarGuidebookView(containerEl: HTMLElement, ctx: RightSidebarViewRenderContext): () => void {
	const rootEl = containerEl.createDiv({ cls: "cna-right-sidebar-guidebook" });
	const headerEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__header" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	const titleEl = headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__title" });
	const titleIconEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-icon" });
	setIcon(titleIconEl, UI.icon.plugin);
	const titleTextEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-text" });

	const toggleButton = new ToggleButtonComponent({
		containerEl: headerEl,
		className: "cna-right-sidebar-guidebook__toggle-button",
		onIcon: UI.icon.collapse,
		offIcon: UI.icon.expand,
		onTooltip: ctx.t("feature.right_sidebar.guidebook.action.collapse_all"),
		offTooltip: ctx.t("feature.right_sidebar.guidebook.action.expand_all"),
		initialOn: true,
		onToggle: (isOn) => {
			rootEl.toggleClass("is-collapsed", !isOn);
		},
	});

	rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__divider" });
	const contentEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__content" });
	contentEl.createDiv({
		cls: "cna-right-sidebar-panel-placeholder",
		text: ctx.t("settings.tab.coming_soon"),
	});

	const novelLibraryService = new NovelLibraryService(ctx.app);
	let lastMarkdownFilePath = resolveActiveMarkdownFilePath(ctx) ?? cachedMarkdownFilePath;
	if (lastMarkdownFilePath) {
		cachedMarkdownFilePath = lastMarkdownFilePath;
	}
	const syncCurrentLibraryName = (preferredFilePath?: string | null): void => {
		const nextFilePath = preferredFilePath ?? resolveActiveMarkdownFilePath(ctx) ?? lastMarkdownFilePath ?? cachedMarkdownFilePath;
		if (nextFilePath) {
			lastMarkdownFilePath = nextFilePath;
			cachedMarkdownFilePath = nextFilePath;
		}
		titleTextEl.setText(resolveCurrentNovelLibraryName(ctx, novelLibraryService, nextFilePath));
	};
	syncCurrentLibraryName();

	const eventRefs = [
		ctx.app.workspace.on("file-open", (file) => {
			syncCurrentLibraryName(file?.path ?? null);
		}),
		ctx.app.workspace.on("active-leaf-change", (leaf) => {
			const markdownView = leaf?.view;
			if (!(markdownView instanceof MarkdownView)) {
				return;
			}
			syncCurrentLibraryName(markdownView.file?.path ?? null);
		}),
	];

	const disposeSettingsChange = ctx.onSettingsChange?.(() => {
		syncCurrentLibraryName();
	});

	return () => {
		toggleButton.destroy();
		for (const eventRef of eventRefs) {
			ctx.app.workspace.offref(eventRef);
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
