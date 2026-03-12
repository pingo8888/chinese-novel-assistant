import type { SidebarViewRenderContext } from "../sidebar/types";
import { MarkdownView, Notice, TFile, TFolder, setIcon, type EventRef, type TAbstractFile } from "obsidian";
import { UI } from "../../../core/constants";
import { ClearableInputComponent } from "../../componets/clearable-input";
import { showContextMenuAtMouseEvent } from "../../componets/context-menu";
import { createStickyNoteCardList } from "./card-list";
import type { StickyNoteSortMode, StickyNoteViewOptions } from "./types";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../../services/novel-library-service";
import { StickyNoteRepository } from "../../../features/sticky-note/repository";
type StickyNoteSparklesTooltipKey = "feature.right_sidebar.sticky_note.action.sparkles.tooltip";
type StickyNoteSortTooltipKey =
	| "feature.right_sidebar.sticky_note.sort.tooltip.desc"
	| "feature.right_sidebar.sticky_note.sort.tooltip.asc";

const STICKY_NOTE_SORT_MENU_SECTION = "cna-sticky-note-sort";

export function renderStickyNoteSidebarPanel(containerEl: HTMLElement, ctx: SidebarViewRenderContext): () => void {
	const rootEl = containerEl.createDiv({ cls: "cna-right-sidebar-guidebook" });
	const headerEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__header" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	const titleEl = headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__title" });
	const titleIconEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-icon" });
	setIcon(titleIconEl, UI.ICON.STICKY_NOTE);
	const titleTextEl = titleEl.createSpan({
		cls: "cna-right-sidebar-guidebook__title-text",
	});

	const actionButtonEl = headerEl.createEl("button", {
		cls: "cna-right-sidebar-guidebook__toggle-button",
		attr: {
			type: "button",
		},
	});
	setIcon(actionButtonEl, UI.ICON.SPARKLES);

	rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__divider" });
	const contentEl = rootEl.createDiv({ cls: "cna-right-sidebar-sticky-note__content" });
	const toolbarEl = contentEl.createDiv({ cls: "cna-right-sidebar-sticky-note__toolbar" });
	const searchWrapEl = toolbarEl.createDiv({ cls: "cna-right-sidebar-sticky-note__search-wrap" });
	const listWrapEl = contentEl.createDiv({ cls: "cna-right-sidebar-sticky-note__list-wrap" });
	let noteCountEl: HTMLElement | null = null;

	let sortMode: StickyNoteSortMode = "created_desc";
	let searchKeyword = "";
	const novelLibraryService = new NovelLibraryService(ctx.app);
	const repository = new StickyNoteRepository(ctx.app);
	let stickyNoteRootPaths = resolveScopedStickyNoteRootPaths(ctx, novelLibraryService);
	let lastScopeReferencePath: string | null = ctx.app.workspace.getActiveFile()?.path ?? null;

	const resolveViewOptions = (): StickyNoteViewOptions => {
		const settings = ctx.getSettings();
		return {
			defaultRows: settings.stickyNoteDefaultRows,
			tagHintTextEnabled: settings.stickyNoteTagHintTextEnabled,
			imageAutoExpand: settings.stickyNoteImageAutoExpand,
		};
	};

	const cardList = createStickyNoteCardList({
		app: ctx.app,
		containerEl: listWrapEl,
		t: (key) => ctx.t(key),
		getSettings: () => ctx.getSettings(),
		getStickyNoteRootPaths: () => stickyNoteRootPaths,
		onVisibleCountChange: (count) => {
			noteCountEl?.setText(`${Math.max(0, count)}`);
		},
		initialSortMode: sortMode,
		initialSearchKeyword: searchKeyword,
		initialViewOptions: resolveViewOptions(),
	});
	const isStickyNoteMarkdownPath = (path: string): boolean => {
		if (!path || !path.toLowerCase().endsWith(".md")) {
			return false;
		}
		return stickyNoteRootPaths.some((rootPath) => novelLibraryService.isSameOrChildPath(path, rootPath));
	};
	const onVaultFileChanged = (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) {
			return;
		}
		if (!isStickyNoteMarkdownPath(file.path)) {
			return;
		}
		cardList.applyVaultFileCreateOrModify(file.path);
	};
	const onVaultFileDeleted = (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) {
			return;
		}
		if (!isStickyNoteMarkdownPath(file.path)) {
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
		const libraryRoots = novelLibraryService.normalizeLibraryRoots(ctx.getSettings().novelLibraries);
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
				refreshStickyNoteScope(file.path);
			}
			return;
		}
		const nextPath = file instanceof TFile && isStickyNoteMarkdownPath(file.path) ? file.path : "";
		const oldPathMatched = isStickyNoteMarkdownPath(oldPath);
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

	new ClearableInputComponent({
		containerEl: searchWrapEl,
		containerClassName: "cna-sticky-note-search-input-container",
		placeholder: "",
		clearAriaLabel: "",
		onChange: (value) => {
			searchKeyword = value;
			cardList.setSearchKeyword(value);
		},
	});
	const searchInputContainerEl = searchWrapEl.querySelector<HTMLElement>(".cna-sticky-note-search-input-container");
	noteCountEl = searchInputContainerEl?.createSpan({
		cls: "cna-sticky-note-search-count",
		text: "0",
	}) ?? null;
	const searchInputEl = searchWrapEl.querySelector<HTMLInputElement>("input");
	const searchClearButtonEl = searchWrapEl.querySelector<HTMLElement>(".search-input-clear-button");

	const sortButtonEl = toolbarEl.createEl("button", {
		cls: "cna-right-sidebar-sticky-note__sort-button",
		attr: {
			type: "button",
		},
	});

	const updateSortButton = () => {
		sortButtonEl.empty();
		const iconName =
			sortMode === "created_desc" || sortMode === "modified_desc"
				? UI.ICON.CALENDAR_ARROW_DOWN
				: UI.ICON.CALENDAR_ARROW_UP;
		setIcon(sortButtonEl, iconName);
		sortButtonEl.setAttr("aria-label", ctx.t(getSortDirectionTooltipKey(sortMode)));
	};

	const updateLocalizedText = () => {
		updateTitleText();
		actionButtonEl.setAttr("aria-label", ctx.t(getSparklesTooltipKey()));
		searchInputEl?.setAttr("placeholder", ctx.t("feature.right_sidebar.sticky_note.search.placeholder"));
		searchClearButtonEl?.setAttr("aria-label", ctx.t("feature.right_sidebar.sticky_note.search.clear"));
		updateSortButton();
		cardList.rerender();
	};

	const createStickyNote = async (): Promise<void> => {
		const stickyRootPath = resolveTargetStickyNoteRootPath(ctx, novelLibraryService);
		if (!stickyRootPath) {
			new Notice(ctx.t("command.sticky_note.create.no_library"));
			return;
		}
		try {
			const file = await repository.createCardFile(stickyRootPath, {
				defaultRows: ctx.getSettings().stickyNoteDefaultRows,
			});
			cardList.applyVaultFileCreateOrModify(file.path);
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to create sticky note.", error);
			new Notice(ctx.t("command.sticky_note.create.failed"));
		}
	};

	const updateTitleText = (preferredFilePath?: string | null): void => {
		titleTextEl.setText(resolveCurrentNovelLibraryName(ctx, novelLibraryService, preferredFilePath));
	};

	const refreshStickyNoteScope = (preferredFilePath?: string | null): void => {
		const activeFilePath = ctx.app.workspace.getActiveFile()?.path ?? null;
		const referencePath = typeof preferredFilePath === "string" && preferredFilePath.length > 0
			? preferredFilePath
			: (activeFilePath ?? lastScopeReferencePath);
		if (referencePath) {
			lastScopeReferencePath = referencePath;
		}
		updateTitleText(referencePath);
		const nextRoots = resolveScopedStickyNoteRootPaths(ctx, novelLibraryService, referencePath);
		if (areStringArraysEqual(stickyNoteRootPaths, nextRoots)) {
			return;
		}
		stickyNoteRootPaths = nextRoots;
		cardList.refresh();
	};

	const openSortMenu = (event: MouseEvent): void => {
		showContextMenuAtMouseEvent(event, [
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.created_desc"),
				icon: UI.ICON.CALENDAR_ARROW_DOWN,
				checked: sortMode === "created_desc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "created_desc";
					updateSortButton();
					cardList.setSortMode(sortMode);
				},
			},
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.created_asc"),
				icon: UI.ICON.CALENDAR_ARROW_UP,
				checked: sortMode === "created_asc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "created_asc";
					updateSortButton();
					cardList.setSortMode(sortMode);
				},
			},
			{ kind: "separator" },
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.modified_desc"),
				icon: UI.ICON.CALENDAR_ARROW_DOWN,
				checked: sortMode === "modified_desc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "modified_desc";
					updateSortButton();
					cardList.setSortMode(sortMode);
				},
			},
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.modified_asc"),
				icon: UI.ICON.CALENDAR_ARROW_UP,
				checked: sortMode === "modified_asc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "modified_asc";
					updateSortButton();
					cardList.setSortMode(sortMode);
				},
			},
		]);
	};
	sortButtonEl.addEventListener("click", openSortMenu);
	const onCreateClick = (): void => {
		void createStickyNote();
	};
	actionButtonEl.addEventListener("click", onCreateClick);
	const workspaceEventRefs: EventRef[] = [
		ctx.app.workspace.on("file-open", (file) => {
			refreshStickyNoteScope(file?.path ?? null);
		}),
		ctx.app.workspace.on("active-leaf-change", (leaf) => {
			const markdownView = leaf?.view;
			if (!(markdownView instanceof MarkdownView)) {
				return;
			}
			refreshStickyNoteScope(markdownView.file?.path ?? null);
		}),
	];
	updateLocalizedText();
	const disposeSettingsChange = ctx.onSettingsChange?.(() => {
		refreshStickyNoteScope();
		cardList.setViewOptions(resolveViewOptions());
		updateLocalizedText();
	});

	return () => {
		sortButtonEl.removeEventListener("click", openSortMenu);
		actionButtonEl.removeEventListener("click", onCreateClick);
		for (const ref of vaultEventRefs) {
			ctx.app.vault.offref(ref);
		}
		for (const ref of workspaceEventRefs) {
			ctx.app.workspace.offref(ref);
		}
		disposeSettingsChange?.();
		cardList.destroy();
	};
}

function resolveStickyNoteRootPaths(
	settings: ReturnType<SidebarViewRenderContext["getSettings"]>,
	novelLibraryService: NovelLibraryService,
): string[] {
	const roots = settings.novelLibraries
		.map((libraryPath) =>
			novelLibraryService.resolveNovelLibrarySubdirPath(
				settings,
				libraryPath,
				NOVEL_LIBRARY_SUBDIR_NAMES.stickyNote,
			),
		)
		.map((path) => novelLibraryService.normalizeVaultPath(path))
		.filter((path) => path.length > 0);
	return Array.from(new Set(roots));
}

function resolveScopedStickyNoteRootPaths(
	ctx: SidebarViewRenderContext,
	novelLibraryService: NovelLibraryService,
	preferredFilePath?: string | null,
): string[] {
	const settings = ctx.getSettings();
	const allRoots = resolveStickyNoteRootPaths(settings, novelLibraryService);
	if (allRoots.length === 0) {
		return allRoots;
	}
	const normalizedLibraryRoots = novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
	const referencePath = typeof preferredFilePath === "string"
		? preferredFilePath
		: (ctx.app.workspace.getActiveFile()?.path ?? "");
	if (!referencePath) {
		return [];
	}
	const matchedLibraryRoot = referencePath
		? novelLibraryService.resolveContainingLibraryRoot(referencePath, normalizedLibraryRoots)
		: null;
	if (!matchedLibraryRoot) {
		return [];
	}
	const stickyRootPath = novelLibraryService.resolveNovelLibrarySubdirPath(
		settings,
		matchedLibraryRoot,
		NOVEL_LIBRARY_SUBDIR_NAMES.stickyNote,
	);
	const normalizedStickyRootPath = novelLibraryService.normalizeVaultPath(stickyRootPath);
	return normalizedStickyRootPath ? [normalizedStickyRootPath] : allRoots;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

function resolveTargetStickyNoteRootPath(
	ctx: SidebarViewRenderContext,
	novelLibraryService: NovelLibraryService,
): string | null {
	const settings = ctx.getSettings();
	const normalizedLibraryRoots = novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
	if (normalizedLibraryRoots.length === 0) {
		return null;
	}
	const activeFilePath = ctx.app.workspace.getActiveFile()?.path ?? "";
	const activeLibraryRoot = activeFilePath
		? novelLibraryService.resolveContainingLibraryRoot(activeFilePath, normalizedLibraryRoots)
		: null;
	const targetLibraryRoot = activeLibraryRoot ?? normalizedLibraryRoots[0] ?? "";
	if (!targetLibraryRoot) {
		return null;
	}
	const stickyRootPath = novelLibraryService.resolveNovelLibrarySubdirPath(
		settings,
		targetLibraryRoot,
		NOVEL_LIBRARY_SUBDIR_NAMES.stickyNote,
	);
	const normalizedStickyRootPath = novelLibraryService.normalizeVaultPath(stickyRootPath);
	return normalizedStickyRootPath.length > 0 ? normalizedStickyRootPath : null;
}

function resolveCurrentNovelLibraryName(
	ctx: SidebarViewRenderContext,
	novelLibraryService: NovelLibraryService,
	filePath?: string | null,
): string {
	const activeFilePath = typeof filePath === "string" && filePath.length > 0
		? filePath
		: (ctx.app.workspace.getActiveFile()?.path ?? "");
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

function getSparklesTooltipKey(): StickyNoteSparklesTooltipKey {
	return "feature.right_sidebar.sticky_note.action.sparkles.tooltip";
}

function getSortDirectionTooltipKey(mode: StickyNoteSortMode): StickyNoteSortTooltipKey {
	switch (mode) {
		case "created_desc":
		case "modified_desc":
			return "feature.right_sidebar.sticky_note.sort.tooltip.desc";
		case "created_asc":
		case "modified_asc":
			return "feature.right_sidebar.sticky_note.sort.tooltip.asc";
		default:
			return "feature.right_sidebar.sticky_note.sort.tooltip.desc";
	}
}


