import { MarkdownView, Notice, TFile, TFolder, setIcon, type EventRef, type TAbstractFile } from "obsidian";
import { UI, type PluginContext, NovelLibraryService } from "../../../core";
import { ClearableInputComponent, showContextMenuAtMouseEvent } from "../../../ui";
import { areStringArraysEqual, resolveEditorViewFromMarkdownView } from "../../../utils";
import { AnnotationRepository } from "../repository";
import { createAnnotationCardList } from "./card-list";
import { emitAnnotationLocateFlash } from "../flash-bus";
import { ANNOTATION_COLOR_TYPES } from "../color-types";
import { normalizeVaultPath } from "../../../core/novel-library-service";
import type { AnnotationCard } from "./types";

const ANNOTATION_FILTER_MENU_SECTION = "cna-annotation-filter-color";
const ANNOTATION_FILTER_SCOPE_MENU_SECTION = "cna-annotation-filter-scope";

export function renderAnnotationSidebarPanel(containerEl: HTMLElement, ctx: PluginContext): () => void {
	const rootEl = containerEl.createDiv({ cls: "cna-right-sidebar-guidebook" });
	const headerEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__header" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	const titleEl = headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__title" });
	const titleIconEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-icon" });
	setIcon(titleIconEl, UI.ICON.BOOKMARK);
	const titleTextEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-text" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__divider" });
	const contentEl = rootEl.createDiv({ cls: "cna-right-sidebar-annotation__content" });
	const toolbarEl = contentEl.createDiv({ cls: "cna-right-sidebar-annotation__toolbar" });
	const searchWrapEl = toolbarEl.createDiv({ cls: "cna-right-sidebar-annotation__search-wrap" });
	const listWrapEl = contentEl.createDiv({ cls: "cna-right-sidebar-annotation__list-wrap" });
	let annotationCountEl: HTMLElement | null = null;

	const novelLibraryService = new NovelLibraryService(ctx.app);
	const repository = new AnnotationRepository(ctx.app);
	let annotationRootPaths = repository.resolveScopedAnnotationRootPaths(
		ctx.settings,
		ctx.app.workspace.getActiveFile()?.path ?? "",
	);
	let lastScopeReferencePath: string | null = ctx.app.workspace.getActiveFile()?.path ?? null;
	let searchKeyword = "";
	let colorFilters = new Set<string>();
	let onlyCurrentSourceFilterEnabled = false;
	let pendingManualLocateCardId: string | null = null;
	let pendingManualLocateSourcePath: string | null = null;
	let activeEditorScrollDom: HTMLElement | null = null;
	let activeEditorInteractionDom: HTMLElement | null = null;
	let activeEditorSyncRaf = 0;
	let manualLocateGuardUntil = 0;

	const cardList = createAnnotationCardList({
		app: ctx.app,
		containerEl: listWrapEl,
		t: (key) => ctx.t(key),
		getSettings: () => ctx.settings,
		getAnnotationRootPaths: () => annotationRootPaths,
		onCountChange: (stats) => {
			const total = Math.max(0, stats.total);
			const visible = Math.max(0, stats.visible);
			const hasFilter = searchKeyword.trim().length > 0 || colorFilters.size > 0 || onlyCurrentSourceFilterEnabled;
			annotationCountEl?.setText(hasFilter ? `${visible}/${total}` : `${total}`);
		},
		initialSearchKeyword: searchKeyword,
		onLocateCard: (card) => {
			const targetSourcePath = normalizeVaultPath(card.sourcePath);
			const activeSourcePath = normalizeVaultPath(ctx.app.workspace.getActiveFile()?.path ?? "");
			const willSwitchFile = targetSourcePath.length > 0 && targetSourcePath !== activeSourcePath;
			cardList.setActiveCardId(card.id);
			if (willSwitchFile) {
				pendingManualLocateCardId = card.id;
				pendingManualLocateSourcePath = targetSourcePath;
				manualLocateGuardUntil = Date.now() + 1200;
			} else {
				pendingManualLocateCardId = null;
				pendingManualLocateSourcePath = null;
			}
			const locateCardId = card.id;
			void locateCard(card, ctx).finally(() => {
				if (pendingManualLocateCardId === locateCardId) {
					pendingManualLocateCardId = null;
					pendingManualLocateSourcePath = null;
				}
				if (willSwitchFile) {
					manualLocateGuardUntil = Date.now() + 350;
				}
			});
		},
	});

	new ClearableInputComponent({
		containerEl: searchWrapEl,
		containerClassName: "cna-annotation-search-input-container",
		placeholder: "",
		onChange: (value) => {
			searchKeyword = value;
			cardList.setSearchKeyword(value);
			if (ctx.settings.annotationAutoLocateOnFileSwitch) {
				cardList.setAutoLocateFilePath(ctx.app.workspace.getActiveFile()?.path ?? null);
			}
			scheduleSyncActiveCardByEditorCursor();
		},
	});

	const searchInputContainerEl = searchWrapEl.querySelector<HTMLElement>(".cna-annotation-search-input-container");
	annotationCountEl = searchInputContainerEl?.createSpan({
		cls: "cna-annotation-search-count",
		text: "0",
	}) ?? null;
	const searchInputEl = searchWrapEl.querySelector<HTMLInputElement>("input");
	const searchClearButtonEl = searchWrapEl.querySelector<HTMLElement>(".search-input-clear-button");

	const filterButtonEl = toolbarEl.createEl("button", {
		cls: "cna-right-sidebar-annotation__sort-button cna-annotation-filter-button",
		attr: {
			type: "button",
		},
	});
	setIcon(filterButtonEl, UI.ICON.FUNNEL);

	const isAnnotationFileInScope = (path: string): boolean => {
		if (!path || !path.toLowerCase().endsWith(".anno.md")) {
			return false;
		}
		return annotationRootPaths.some((rootPath) => novelLibraryService.isSameOrChildPath(path, rootPath));
	};

	const onVaultFileChanged = (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) {
			return;
		}
		if (!isAnnotationFileInScope(file.path)) {
			return;
		}
		cardList.applyVaultFileCreateOrModify(file.path);
	};

	const onVaultFileDeleted = (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) {
			return;
		}
		if (!isAnnotationFileInScope(file.path)) {
			return;
		}
		cardList.applyVaultFileDelete(file.path);
	};

	const onVaultFileRenamed = (file: TAbstractFile, oldPath: string): void => {
		if (file instanceof TFolder) {
			refreshAnnotationScope(file.path);
			return;
		}
		const nextPath = file instanceof TFile && isAnnotationFileInScope(file.path) ? file.path : "";
		const oldPathMatched = isAnnotationFileInScope(oldPath);
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

	const refreshAnnotationScope = (preferredFilePath?: string | null): void => {
		const activeFilePath = ctx.app.workspace.getActiveFile()?.path ?? null;
		const referencePath = typeof preferredFilePath === "string" && preferredFilePath.length > 0
			? preferredFilePath
			: (activeFilePath ?? lastScopeReferencePath);
		if (referencePath) {
			lastScopeReferencePath = referencePath;
		}
		updateTitleText(referencePath);
		const nextRoots = repository.resolveScopedAnnotationRootPaths(ctx.settings, referencePath);
		if (areStringArraysEqual(annotationRootPaths, nextRoots)) {
			return;
		}
		annotationRootPaths = nextRoots;
		cardList.refresh();
	};

	const applyOnlyCurrentSourceFilter = (preferredFilePath?: string | null): void => {
		if (!onlyCurrentSourceFilterEnabled) {
			cardList.setSourcePathFilter(null);
			return;
		}
		const referencePath = typeof preferredFilePath === "string"
			? preferredFilePath
			: (ctx.app.workspace.getActiveFile()?.path ?? "");
		const normalizedPath = normalizeVaultPath(referencePath);
		if (!normalizedPath) {
			return;
		}
		cardList.setSourcePathFilter(normalizedPath);
	};

	const applyAutoLocate = (preferredFilePath?: string | null): void => {
		if (!ctx.settings.annotationAutoLocateOnFileSwitch) {
			return;
		}
		const targetPath = typeof preferredFilePath === "string"
			? preferredFilePath
			: (ctx.app.workspace.getActiveFile()?.path ?? null);
		cardList.setAutoLocateFilePath(targetPath);
	};

	const applyPendingManualLocateSelection = (preferredFilePath?: string | null): boolean => {
		if (!pendingManualLocateCardId || !pendingManualLocateSourcePath) {
			return false;
		}
		const targetPath = normalizeVaultPath(typeof preferredFilePath === "string"
			? preferredFilePath
			: (ctx.app.workspace.getActiveFile()?.path ?? ""));
		if (!targetPath || targetPath !== pendingManualLocateSourcePath) {
			return false;
		}
		cardList.setActiveCardId(pendingManualLocateCardId);
		return true;
	};

	const syncActiveCardByEditorCursor = (): void => {
		if (pendingManualLocateCardId || Date.now() < manualLocateGuardUntil) {
			return;
		}
		const activeMarkdownView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
		if (!(activeMarkdownView instanceof MarkdownView) || !activeMarkdownView.file?.path) {
			return;
		}
		const editorView = resolveEditorViewFromMarkdownView(activeMarkdownView);
		if (!editorView) {
			return;
		}
		const selectionHead = Number.isFinite(editorView.state.selection.main.head)
			? Math.round(editorView.state.selection.main.head)
			: 0;
		const cursorOffset = Math.max(0, Math.min(editorView.state.doc.length, selectionHead));
		cardList.setActiveCardBySourceOffset(activeMarkdownView.file.path, cursorOffset);
	};

	const scheduleSyncActiveCardByEditorCursor = (): void => {
		if (activeEditorSyncRaf !== 0) {
			return;
		}
		activeEditorSyncRaf = window.requestAnimationFrame(() => {
			activeEditorSyncRaf = 0;
			syncActiveCardByEditorCursor();
		});
	};

	const onActiveEditorScroll = (): void => {
		scheduleSyncActiveCardByEditorCursor();
	};

	const onActiveEditorInteraction = (): void => {
		scheduleSyncActiveCardByEditorCursor();
	};

	const detachActiveEditorBindings = (): void => {
		if (activeEditorScrollDom) {
			activeEditorScrollDom.removeEventListener("scroll", onActiveEditorScroll);
			activeEditorScrollDom = null;
		}
		if (activeEditorInteractionDom) {
			activeEditorInteractionDom.removeEventListener("pointerup", onActiveEditorInteraction);
			activeEditorInteractionDom.removeEventListener("keyup", onActiveEditorInteraction);
			activeEditorInteractionDom = null;
		}
	};

	const refreshActiveEditorBindings = (): void => {
		detachActiveEditorBindings();
		const activeMarkdownView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
		if (!(activeMarkdownView instanceof MarkdownView)) {
			return;
		}
		const editorView = resolveEditorViewFromMarkdownView(activeMarkdownView);
		if (!editorView || !(editorView.scrollDOM instanceof HTMLElement) || !(editorView.dom instanceof HTMLElement)) {
			return;
		}
		activeEditorScrollDom = editorView.scrollDOM;
		activeEditorScrollDom.addEventListener("scroll", onActiveEditorScroll, { passive: true });
		activeEditorInteractionDom = editorView.dom;
		activeEditorInteractionDom.addEventListener("pointerup", onActiveEditorInteraction, { passive: true });
		activeEditorInteractionDom.addEventListener("keyup", onActiveEditorInteraction);
	};

	const openFilterMenu = (event: MouseEvent): void => {
		showContextMenuAtMouseEvent(event, [
			...ANNOTATION_COLOR_TYPES.map((colorType) => ({
				title: ctx.t(colorType.labelKey),
				colorHex: colorType.colorHex,
				checked: colorFilters.has(colorType.colorHex),
				section: ANNOTATION_FILTER_MENU_SECTION,
				onClick: () => {
					const next = new Set(colorFilters);
					if (next.has(colorType.colorHex)) {
						next.delete(colorType.colorHex);
					} else {
						next.add(colorType.colorHex);
					}
					colorFilters = next;
					cardList.setColorFilters(Array.from(next));
					applyAutoLocate();
				},
			})),
			{ kind: "separator" },
			{
				title: ctx.t("feature.annotation.filter.current_file"),
				icon: UI.ICON.FILE,
				checked: onlyCurrentSourceFilterEnabled,
				section: ANNOTATION_FILTER_SCOPE_MENU_SECTION,
				onClick: () => {
					onlyCurrentSourceFilterEnabled = !onlyCurrentSourceFilterEnabled;
					applyOnlyCurrentSourceFilter();
					applyAutoLocate();
					scheduleSyncActiveCardByEditorCursor();
				},
			},
			{
				title: ctx.t("feature.annotation.filter.clear"),
				icon: UI.ICON.CLEAN,
				disabled: colorFilters.size === 0 && !onlyCurrentSourceFilterEnabled,
				onClick: () => {
					colorFilters = new Set();
					onlyCurrentSourceFilterEnabled = false;
					cardList.setColorFilters([]);
					applyOnlyCurrentSourceFilter();
					applyAutoLocate();
					scheduleSyncActiveCardByEditorCursor();
				},
			},
		], {
			menuClassName: "cna-annotation-filter-menu",
			keepInViewport: true,
		});
	};

	filterButtonEl.addEventListener("click", openFilterMenu);

	const workspaceEventRefs: EventRef[] = [
		ctx.app.workspace.on("file-open", (file) => {
			const filePath = file?.path ?? null;
			refreshAnnotationScope(filePath);
			refreshActiveEditorBindings();
			applyOnlyCurrentSourceFilter(filePath);
			if (pendingManualLocateCardId) {
				applyPendingManualLocateSelection(filePath);
				return;
			}
			if (Date.now() < manualLocateGuardUntil) {
				return;
			}
			applyAutoLocate(filePath);
			scheduleSyncActiveCardByEditorCursor();
		}),
		ctx.app.workspace.on("active-leaf-change", (leaf) => {
			const markdownView = leaf?.view;
			if (!(markdownView instanceof MarkdownView)) {
				refreshActiveEditorBindings();
				return;
			}
			const filePath = markdownView.file?.path ?? null;
			refreshAnnotationScope(filePath);
			refreshActiveEditorBindings();
			applyOnlyCurrentSourceFilter(filePath);
			if (pendingManualLocateCardId) {
				applyPendingManualLocateSelection(filePath);
				return;
			}
			if (Date.now() < manualLocateGuardUntil) {
				return;
			}
			applyAutoLocate(filePath);
			scheduleSyncActiveCardByEditorCursor();
		}),
	];

	const updateLocalizedText = (): void => {
		updateTitleText();
		searchInputEl?.setAttr("placeholder", ctx.t("feature.annotation.search.placeholder"));
		searchClearButtonEl?.setAttr("aria-label", ctx.t("feature.annotation.search.clear"));
		filterButtonEl.setAttr("aria-label", ctx.t("feature.annotation.filter.tooltip"));
		cardList.rerender();
	};

	const disposeSettingsChange = ctx.onSettingsChange(() => {
		refreshAnnotationScope();
		updateLocalizedText();
		applyOnlyCurrentSourceFilter();
		applyAutoLocate();
		refreshActiveEditorBindings();
		scheduleSyncActiveCardByEditorCursor();
	});

	updateLocalizedText();
	applyOnlyCurrentSourceFilter();
	applyAutoLocate();
	refreshActiveEditorBindings();
	scheduleSyncActiveCardByEditorCursor();

	return () => {
		filterButtonEl.removeEventListener("click", openFilterMenu);
		for (const ref of vaultEventRefs) {
			ctx.app.vault.offref(ref);
		}
		for (const ref of workspaceEventRefs) {
			ctx.app.workspace.offref(ref);
		}
		detachActiveEditorBindings();
		if (activeEditorSyncRaf !== 0) {
			window.cancelAnimationFrame(activeEditorSyncRaf);
			activeEditorSyncRaf = 0;
		}
		disposeSettingsChange();
		cardList.destroy();
	};
}

async function locateCard(card: AnnotationCard, ctx: PluginContext): Promise<void> {
	const file = ctx.app.vault.getAbstractFileByPath(card.sourcePath);
	if (!(file instanceof TFile)) {
		new Notice(ctx.t("feature.annotation.notice.source_missing"));
		return;
	}
	const currentFilePath = normalizeVaultPath(ctx.app.workspace.getActiveFile()?.path ?? "");
	const targetFilePath = normalizeVaultPath(file.path);
	if (currentFilePath !== targetFilePath) {
		await ctx.app.workspace.openLinkText(file.path, file.path, false);
	}
	let targetView = resolveOpenedMarkdownView(ctx, file.path);
	if (!targetView) {
		// Fallback: ensure a markdown leaf is opened for cursor positioning.
		await ctx.app.workspace.openLinkText(file.path, file.path, false);
		targetView = resolveOpenedMarkdownView(ctx, file.path);
	}
	if (!targetView) {
		return;
	}
	let line = Math.max(0, Math.round(card.line));
	let ch = Math.max(0, Math.round(card.ch));
	const editorAny = targetView.editor as unknown as {
		setCursor?: (line: number, ch: number) => void;
		scrollIntoView?: (
			position: { from: { line: number; ch: number }; to: { line: number; ch: number } },
			center?: boolean,
		) => void;
		offsetToPos?: (offset: number) => { line: number; ch: number };
	};
	const fallbackStartOffset = Math.max(0, Math.round(card.anchorOffset));
	const rawTailOffset = Number.isFinite(card.anchorEndOffset) ? Math.round(card.anchorEndOffset) : fallbackStartOffset;
	const tailOffset = Math.max(fallbackStartOffset, rawTailOffset);
	if (typeof editorAny.offsetToPos === "function") {
		try {
			const tailPos = editorAny.offsetToPos(tailOffset);
			if (tailPos && Number.isFinite(tailPos.line) && Number.isFinite(tailPos.ch)) {
				line = Math.max(0, Math.round(tailPos.line));
				ch = Math.max(0, Math.round(tailPos.ch));
			}
		} catch {
			// Keep fallback line/ch for compatibility.
		}
	}
	editorAny.setCursor?.(line, ch);
	editorAny.scrollIntoView?.(
		{
			from: { line, ch },
			to: { line, ch },
		},
		true,
	);
	emitAnnotationLocateFlash({
		sourcePath: normalizeVaultPath(card.sourcePath),
		annotationId: card.id,
	});
}

function resolveOpenedMarkdownView(ctx: PluginContext, filePath: string): MarkdownView | null {
	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView?.file?.path === filePath) {
		return activeView;
	}
	for (const leaf of ctx.app.workspace.getLeavesOfType("markdown")) {
		if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
			return leaf.view;
		}
	}
	return null;
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










