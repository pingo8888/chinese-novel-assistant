import { MarkdownView, Notice, TFile, TFolder, setIcon, type EventRef, type TAbstractFile } from "obsidian";
import { UI, type PluginContext, type NovelLibraryService } from "../../../core";
import { ClearableInputComponent, showContextMenuAtMouseEvent } from "../../../ui";
import { areStringArraysEqual, truncateMenuTitle } from "../../../utils";
import { getTimelineColorTypes, resolveTimelineTypeTitle } from "../color-types";
import { TimelineRepository } from "../repository";
import { createTimelineCardList } from "./card-list";

const TIMELINE_FILTER_MENU_SECTION = "cna-timeline-filter-color";

export function renderTimelineSidebarPanel(containerEl: HTMLElement, ctx: PluginContext): () => void {
	const rootEl = containerEl.createDiv({ cls: "cna-right-sidebar-guidebook" });
	const headerEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__header" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	const titleEl = headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__title" });
	const titleIconEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-icon" });
	setIcon(titleIconEl, UI.ICON.TIME_LINE);
	const titleTextEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-text" });

	const addButtonEl = headerEl.createEl("button", {
		cls: "cna-right-sidebar-guidebook__toggle-button",
		attr: {
			type: "button",
		},
	});
	setIcon(addButtonEl, UI.ICON.PLUS);

	rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__divider" });
	const contentEl = rootEl.createDiv({ cls: "cna-right-sidebar-timeline__content" });
	const toolbarEl = contentEl.createDiv({ cls: "cna-right-sidebar-timeline__toolbar" });
	const searchWrapEl = toolbarEl.createDiv({ cls: "cna-right-sidebar-timeline__search-wrap" });
	const listWrapEl = contentEl.createDiv({ cls: "cna-right-sidebar-timeline__list-wrap" });
	let cardCountEl: HTMLElement | null = null;

	const novelLibraryService = ctx.novelLibraryService;
	const repository = new TimelineRepository(ctx.app, ctx.novelLibraryService);
	let timelineRootPaths = repository.resolveScopedTimelineRootPaths(
		ctx.settings,
		ctx.app.workspace.getActiveFile()?.path ?? "",
	);
	let lastScopeReferencePath: string | null = ctx.app.workspace.getActiveFile()?.path ?? null;
	let searchKeyword = "";
	let colorFilters = new Set<string>();

	const cardList = createTimelineCardList({
		app: ctx.app,
		containerEl: listWrapEl,
		t: (key) => ctx.t(key),
		getSettings: () => ctx.settings,
		novelLibraryService: ctx.novelLibraryService,
		getTimelineRootPaths: () => timelineRootPaths,
		onCountChange: (stats) => {
			const total = Math.max(0, stats.total);
			const visible = Math.max(0, stats.visible);
			const hasFilter = searchKeyword.trim().length > 0 || colorFilters.size > 0;
			cardCountEl?.setText(hasFilter ? `${visible}/${total}` : `${total}`);
		},
		initialSearchKeyword: searchKeyword,
	});

	new ClearableInputComponent({
		containerEl: searchWrapEl,
		containerClassName: "cna-timeline-search-input-container",
		placeholder: "",
		onChange: (value) => {
			searchKeyword = value;
			cardList.setSearchKeyword(value);
		},
	});

	const searchInputContainerEl = searchWrapEl.querySelector<HTMLElement>(".cna-timeline-search-input-container");
	cardCountEl = searchInputContainerEl?.createSpan({
		cls: "cna-timeline-search-count",
		text: "0",
	}) ?? null;
	const searchInputEl = searchWrapEl.querySelector<HTMLInputElement>("input");
	const searchClearButtonEl = searchWrapEl.querySelector<HTMLElement>(".search-input-clear-button");

	const filterButtonEl = toolbarEl.createEl("button", {
		cls: "cna-right-sidebar-timeline__sort-button cna-timeline-filter-button",
		attr: {
			type: "button",
		},
	});
	setIcon(filterButtonEl, UI.ICON.FUNNEL);

	const isTimelineFileInScope = (path: string): boolean => {
		if (!path || !path.toLowerCase().endsWith(".timeline.md")) {
			return false;
		}
		return timelineRootPaths.some((rootPath) => novelLibraryService.isSameOrChildPath(path, rootPath));
	};

	const onVaultFileChanged = (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) {
			return;
		}
		if (!isTimelineFileInScope(file.path)) {
			return;
		}
		cardList.applyVaultFileCreateOrModify(file.path);
	};

	const onVaultFileDeleted = (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) {
			return;
		}
		if (!isTimelineFileInScope(file.path)) {
			return;
		}
		cardList.applyVaultFileDelete(file.path);
	};

	const isLibraryFolderRename = (nextPath: string, previousPath: string): boolean => {
		const normalizedNextPath = novelLibraryService.normalizeVaultPath(nextPath);
		const normalizedPreviousPath = novelLibraryService.normalizeVaultPath(previousPath);
		if (!normalizedNextPath || !normalizedPreviousPath || normalizedNextPath === normalizedPreviousPath) {
			return false;
		}
		const libraryRoots = novelLibraryService.normalizeLibraryRoots(ctx.settings.novelLibraries);
		if (libraryRoots.length === 0) {
			return false;
		}
		return libraryRoots.some((libraryRoot) =>
			novelLibraryService.isSameOrChildPath(libraryRoot, normalizedPreviousPath) ||
			novelLibraryService.isSameOrChildPath(normalizedPreviousPath, libraryRoot) ||
			novelLibraryService.isSameOrChildPath(libraryRoot, normalizedNextPath) ||
			novelLibraryService.isSameOrChildPath(normalizedNextPath, libraryRoot),
		);
	};

	const onVaultFileRenamed = (file: TAbstractFile, oldPath: string): void => {
		if (file instanceof TFolder) {
			if (isLibraryFolderRename(file.path, oldPath)) {
				refreshTimelineScope(file.path);
			}
			return;
		}
		const nextPath = file instanceof TFile && isTimelineFileInScope(file.path) ? file.path : "";
		const oldPathMatched = isTimelineFileInScope(oldPath);
		if (!nextPath && !oldPathMatched) {
			return;
		}
		if (nextPath && oldPathMatched) {
			cardList.applyVaultFileRename(oldPath, nextPath);
			return;
		}
		if (nextPath) {
			cardList.applyVaultFileCreateOrModify(nextPath);
			return;
		}
		cardList.applyVaultFileDelete(oldPath);
	};

	const vaultEventRefs: EventRef[] = [
		ctx.app.vault.on("create", onVaultFileChanged),
		ctx.app.vault.on("modify", onVaultFileChanged),
		ctx.app.vault.on("delete", onVaultFileDeleted),
		ctx.app.vault.on("rename", onVaultFileRenamed),
	];

	const updateTitleText = (preferredFilePath?: string | null): void => {
		titleTextEl.setText(resolveCurrentNovelLibraryName(ctx, novelLibraryService, preferredFilePath));
	};

	const refreshTimelineScope = (preferredFilePath?: string | null): void => {
		const activeFilePath = ctx.app.workspace.getActiveFile()?.path ?? null;
		const referencePath = typeof preferredFilePath === "string" && preferredFilePath.length > 0
			? preferredFilePath
			: (activeFilePath ?? lastScopeReferencePath);
		if (referencePath) {
			lastScopeReferencePath = referencePath;
		}
		updateTitleText(referencePath);
		const nextRoots = repository.resolveScopedTimelineRootPaths(ctx.settings, referencePath);
		if (areStringArraysEqual(timelineRootPaths, nextRoots)) {
			return;
		}
		timelineRootPaths = nextRoots;
		cardList.refresh();
	};

	const openFilterMenu = (event: MouseEvent): void => {
		const timelineColorTypes = getTimelineColorTypes(ctx.settings);
		showContextMenuAtMouseEvent(
			event,
			[
				...timelineColorTypes.map((colorType) => ({
					title: truncateMenuTitle(resolveTimelineTypeTitle(colorType, (key) => ctx.t(key))),
					colorHex: colorType.colorHex,
					checked: colorFilters.has(colorType.colorHex),
					section: TIMELINE_FILTER_MENU_SECTION,
					onClick: () => {
						const next = new Set(colorFilters);
						if (next.has(colorType.colorHex)) {
							next.delete(colorType.colorHex);
						} else {
							next.add(colorType.colorHex);
						}
						colorFilters = next;
						cardList.setColorFilters(Array.from(next));
					},
				})),
				{ kind: "separator" as const },
				{
					title: ctx.t("feature.timeline.filter.clear"),
					icon: UI.ICON.CLEAN,
					disabled: colorFilters.size === 0,
					onClick: () => {
						colorFilters = new Set();
						cardList.setColorFilters([]);
					},
				},
			],
			{
				menuClassName: "cna-timeline-filter-menu",
				keepInViewport: true,
			},
		);
	};
	filterButtonEl.addEventListener("click", openFilterMenu);

	const onCreateClick = (): void => {
		if (ctx.settings.novelLibraries.length === 0) {
			new Notice(ctx.t("feature.timeline.notice.no_library"));
			return;
		}
		void cardList.createCardAtEnd(ctx.app.workspace.getActiveFile()?.path ?? null);
	};
	addButtonEl.addEventListener("click", onCreateClick);

	const workspaceEventRefs: EventRef[] = [
		ctx.app.workspace.on("file-open", (file) => {
			refreshTimelineScope(file?.path ?? null);
		}),
		ctx.app.workspace.on("active-leaf-change", (leaf) => {
			const markdownView = leaf?.view;
			if (!(markdownView instanceof MarkdownView)) {
				return;
			}
			refreshTimelineScope(markdownView.file?.path ?? null);
		}),
	];

	const updateLocalizedText = (): void => {
		updateTitleText();
		addButtonEl.setAttr("aria-label", ctx.t("feature.timeline.action.add"));
		searchInputEl?.setAttr("placeholder", ctx.t("feature.timeline.search.placeholder"));
		searchClearButtonEl?.setAttr("aria-label", ctx.t("feature.timeline.search.clear"));
		filterButtonEl.setAttr("aria-label", ctx.t("feature.timeline.filter.tooltip"));
		cardList.rerender();
	};

	updateLocalizedText();
	const disposeSettingsChange = ctx.onSettingsChange(() => {
		refreshTimelineScope();
		updateLocalizedText();
	});

	return () => {
		filterButtonEl.removeEventListener("click", openFilterMenu);
		addButtonEl.removeEventListener("click", onCreateClick);
		for (const ref of vaultEventRefs) {
			ctx.app.vault.offref(ref);
		}
		for (const ref of workspaceEventRefs) {
			ctx.app.workspace.offref(ref);
		}
		disposeSettingsChange();
		cardList.destroy();
	};
}

function resolveCurrentNovelLibraryName(
	ctx: PluginContext,
	novelLibraryService: NovelLibraryService,
	filePath?: string | null,
): string {
	const activeFilePath = typeof filePath === "string" && filePath.length > 0
		? filePath
		: (ctx.app.workspace.getActiveFile()?.path ?? "");
	if (!activeFilePath) {
		return ctx.t("feature.guidebook.current_library.none");
	}
	const settings = ctx.settings;
	const libraryRoots = novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
	const matchedLibraryPath = novelLibraryService.resolveContainingLibraryRoot(activeFilePath, libraryRoots);
	if (!matchedLibraryPath) {
		return ctx.t("feature.guidebook.current_library.none");
	}
	const segments = matchedLibraryPath.split("/").filter((segment) => segment.length > 0);
	return segments[segments.length - 1] ?? matchedLibraryPath;
}
