import { Notice, TFile, type Plugin } from "obsidian";
import {
	IDS,
	STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
	STICKY_NOTE_FLOAT_MIN_HEIGHT,
	STICKY_NOTE_FLOAT_MIN_WIDTH,
	resolveStickyNoteFloatDefaultHeightByRows,
} from "../../constants";
import type { PluginContext } from "../../core/context";
import { NovelLibraryService } from "../../services/novel-library-service";
import { StickyNoteRepository } from "./repository";
import { bindVaultChangeWatcher } from "../../services/vault-change-watcher";
import { renderStickyNoteCardItem } from "../../ui/views/sticky-note/card-item";
import type { StickyNoteCardModel, StickyNoteViewOptions } from "../../ui/views/sticky-note/types";

const FLOAT_LAYER_CLASS = "cna-sticky-note-floating-layer";
const FLOAT_WINDOW_CLASS = "cna-sticky-note-floating-window";
const FLOAT_RESIZE_HANDLE_CLASS = "cna-sticky-note-floating-window__resize-handle";
const FLOAT_SAVE_DEBOUNCE_MS = 160;
const FLOAT_REFRESH_DEBOUNCE_MS = 80;
const STICKY_TAB_FLASH_CLASS = "cna-sticky-note-tab-flash";
const STICKY_TAB_FLASH_DURATION_MS = 220;
const STICKY_TAB_FLASH_ITERATIONS = 4;

interface FloatingWindowEntry {
	card: StickyNoteCardModel;
	windowEl: HTMLElement;
	contentSurfaceEls: HTMLElement[];
	disposeCardItem: () => void;
	disposeInteractions: () => void;
}

interface ApplyWindowFrameOptions {
	bounds?: FloatingBounds;
	contentSurfaceEls?: HTMLElement[];
}

interface FloatingBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export function registerStickyNoteFloatingFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new StickyNoteFloatingFeature(plugin, ctx);
	feature.onload();
}

class StickyNoteFloatingFeature {
	private readonly plugin: Plugin;
	private readonly ctx: PluginContext;
	private readonly repository: StickyNoteRepository;
	private readonly novelLibraryService: NovelLibraryService;

	private layerEl: HTMLElement | null = null;
	private floatingEntriesByPath = new Map<string, FloatingWindowEntry>();
	private saveTimerByPath = new Map<string, number>();
	private refreshTimer: number | null = null;
	private refreshVersion = 0;
	private zIndexSeed = 200;
	private isUnloaded = false;
	private lastViewportWidth = 0;
	private lastViewportHeight = 0;
	private imageExpandedByPath = new Map<string, boolean>();
	private imageAutoExpandSetting = false;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
		this.repository = new StickyNoteRepository(plugin.app);
		this.novelLibraryService = new NovelLibraryService(plugin.app);
	}

	onload(): void {
		this.ensureLayer();
		this.lastViewportWidth = Math.max(1, window.innerWidth);
		this.lastViewportHeight = Math.max(1, window.innerHeight);
		this.imageAutoExpandSetting = this.ctx.settings.stickyNoteImageAutoExpand;

		bindVaultChangeWatcher(this.plugin, this.plugin.app, (event) => {
			if (this.isUnloaded) {
				return;
			}
			if (event.type === "rename" && !(event.file instanceof TFile)) {
				this.scheduleRefreshAll();
				return;
			}
			if (!(event.file instanceof TFile) || event.file.extension !== "md") {
				return;
			}

			switch (event.type) {
				case "create":
				case "modify":
					void this.syncWindowByPath(event.path);
					break;
				case "delete":
					this.removeFloatingWindow(event.path);
					break;
				case "rename":
					if (event.oldPath) {
						this.removeFloatingWindow(event.oldPath);
					}
					void this.syncWindowByPath(event.path);
					break;
				default:
					break;
			}
		});

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			const nextImageAutoExpand = this.ctx.settings.stickyNoteImageAutoExpand;
			if (this.imageAutoExpandSetting !== nextImageAutoExpand) {
				this.imageAutoExpandSetting = nextImageAutoExpand;
				this.imageExpandedByPath.clear();
				for (const entry of this.floatingEntriesByPath.values()) {
					entry.card.isImageExpanded = nextImageAutoExpand;
					this.imageExpandedByPath.set(entry.card.sourcePath, nextImageAutoExpand);
				}
			}
			this.scheduleRefreshAll();
		});
		this.plugin.register(unsubscribeSettingsChange);
		this.plugin.registerDomEvent(window, "resize", () => {
			this.handleViewportResize();
		});
		this.plugin.register(() => {
			this.unload();
		});
		this.scheduleRefreshAll();
	}

	private unload(): void {
		if (this.isUnloaded) {
			return;
		}
		this.isUnloaded = true;
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		for (const timer of this.saveTimerByPath.values()) {
			window.clearTimeout(timer);
		}
		this.saveTimerByPath.clear();
		this.imageExpandedByPath.clear();
		this.clearAllFloatingWindows();
		this.layerEl?.remove();
		this.layerEl = null;
	}

	private ensureLayer(): HTMLElement {
		if (this.layerEl?.isConnected) {
			return this.layerEl;
		}
		this.layerEl?.remove();
		this.layerEl = document.body.createDiv({ cls: FLOAT_LAYER_CLASS });
		return this.layerEl;
	}

	private scheduleRefreshAll(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refreshAllFloatingWindows();
		}, FLOAT_REFRESH_DEBOUNCE_MS);
	}

	private async refreshAllFloatingWindows(): Promise<void> {
		const currentRefreshVersion = ++this.refreshVersion;
		if (!this.ctx.settings.stickyNoteEnabled) {
			this.clearAllFloatingWindows();
			return;
		}

		const cards = await this.repository.listCards(this.ctx.settings, {
			imageAutoExpand: this.ctx.settings.stickyNoteImageAutoExpand,
			defaultRows: this.ctx.settings.stickyNoteDefaultRows,
		});
		if (this.isUnloaded || this.refreshVersion !== currentRefreshVersion) {
			return;
		}
		const floatingCards = cards.filter((card) => card.isFloating);
		const floatingPathSet = new Set(floatingCards.map((card) => card.sourcePath));
		for (const path of this.floatingEntriesByPath.keys()) {
			if (!floatingPathSet.has(path)) {
				this.removeFloatingWindow(path);
			}
		}
		for (const card of floatingCards) {
			this.addOrReplaceFloatingWindow(card);
		}
	}

	private async syncWindowByPath(path: string): Promise<void> {
		if (this.isUnloaded) {
			return;
		}
		if (!this.ctx.settings.stickyNoteEnabled) {
			this.removeFloatingWindow(path);
			return;
		}
		if (!this.isStickyMarkdownPath(path)) {
			this.removeFloatingWindow(path);
			return;
		}
		const card = await this.repository.getCardByPath(path, {
			imageAutoExpand: this.ctx.settings.stickyNoteImageAutoExpand,
			defaultRows: this.ctx.settings.stickyNoteDefaultRows,
		});
		if (this.isUnloaded) {
			return;
		}
		if (!card || !card.isFloating) {
			this.removeFloatingWindow(path);
			return;
		}
		this.addOrReplaceFloatingWindow(card);
	}

	private addOrReplaceFloatingWindow(card: StickyNoteCardModel): void {
		const preservedExpanded = this.imageExpandedByPath.get(card.sourcePath);
		if (typeof preservedExpanded === "boolean") {
			card.isImageExpanded = preservedExpanded;
		}
		this.removeFloatingWindow(card.sourcePath);

		const layerEl = this.ensureLayer();
		const windowEl = layerEl.createDiv({ cls: FLOAT_WINDOW_CLASS });
		this.applyWindowFrame(windowEl, card, true);
		this.bringToFront(windowEl);

		const disposeCardItem = renderStickyNoteCardItem({
			app: this.plugin.app,
			containerEl: windowEl,
			card,
			sortMode: "modified_desc",
			viewOptions: this.resolveFloatingViewOptions(),
			t: (key) => this.ctx.t(key),
			onCardTouched: () => {
				this.imageExpandedByPath.set(card.sourcePath, card.isImageExpanded);
				if (!card.isFloating) {
					this.removeFloatingWindow(card.sourcePath);
					this.flashStickyNoteTabIfNeeded();
				}
				this.schedulePersist(card);
			},
			onImageExpandedChange: (isExpanded) => {
				this.imageExpandedByPath.set(card.sourcePath, isExpanded);
			},
			onCardDelete: () => {
				void this.deleteCard(card);
			},
		});
		const contentSurfaceEls = collectContentSurfaceEls(windowEl);
		this.applyWindowFrame(windowEl, card, true, { contentSurfaceEls });
		const disposeInteractions = this.bindFloatingWindowInteractions(windowEl, card, contentSurfaceEls);
		this.floatingEntriesByPath.set(card.sourcePath, {
			card,
			windowEl,
			contentSurfaceEls,
			disposeCardItem,
			disposeInteractions,
		});
	}

	private removeFloatingWindow(path: string): void {
		const entry = this.floatingEntriesByPath.get(path);
		if (!entry) {
			return;
		}
		this.imageExpandedByPath.set(path, entry.card.isImageExpanded);
		this.floatingEntriesByPath.delete(path);
		this.cancelPersist(path);
		entry.disposeInteractions();
		entry.disposeCardItem();
		entry.windowEl.remove();
	}

	private clearAllFloatingWindows(): void {
		for (const path of [...this.floatingEntriesByPath.keys()]) {
			this.removeFloatingWindow(path);
		}
	}

	private resolveFloatingViewOptions(): StickyNoteViewOptions {
		return {
			defaultRows: this.ctx.settings.stickyNoteDefaultRows,
			tagHintTextEnabled: this.ctx.settings.stickyNoteTagHintTextEnabled,
			imageAutoExpand: this.ctx.settings.stickyNoteImageAutoExpand,
		};
	}

	private async deleteCard(card: StickyNoteCardModel): Promise<void> {
		try {
			await this.repository.deleteCard(card);
			this.imageExpandedByPath.delete(card.sourcePath);
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to delete floating sticky note.", error);
			new Notice(this.ctx.t("feature.right_sidebar.sticky_note.notice.delete_failed"));
		} finally {
			this.removeFloatingWindow(card.sourcePath);
		}
	}

	private schedulePersist(card: StickyNoteCardModel): void {
		this.cancelPersist(card.sourcePath);
		const timer = window.setTimeout(() => {
			this.saveTimerByPath.delete(card.sourcePath);
			void this.persistCard(card);
		}, FLOAT_SAVE_DEBOUNCE_MS);
		this.saveTimerByPath.set(card.sourcePath, timer);
	}

	private cancelPersist(path: string): void {
		const timer = this.saveTimerByPath.get(path);
		if (timer === undefined) {
			return;
		}
		window.clearTimeout(timer);
		this.saveTimerByPath.delete(path);
	}

	private async persistCard(card: StickyNoteCardModel): Promise<void> {
		try {
			await this.repository.saveCard(card);
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to save floating sticky note.", error);
			new Notice(this.ctx.t("feature.right_sidebar.sticky_note.notice.save_failed"));
		}
	}

	private bindFloatingWindowInteractions(windowEl: HTMLElement, card: StickyNoteCardModel, contentSurfaceEls: HTMLElement[]): () => void {
		const headerEl = windowEl.querySelector<HTMLElement>(".cna-sticky-note-card__header");
		const resizeHandleEl = windowEl.createDiv({ cls: FLOAT_RESIZE_HANDLE_CLASS });
		let removeDragListeners: (() => void) | null = null;
		let removeResizeListeners: (() => void) | null = null;

		const bringToFront = () => {
			this.bringToFront(windowEl);
		};
		windowEl.addEventListener("pointerdown", bringToFront, true);

		const onHeaderPointerDown = (event: PointerEvent): void => {
			if (event.button !== 0) {
				return;
			}
			const target = event.target;
			if (target instanceof Element && target.closest("button, input, textarea, select, a, img, [contenteditable='true']")) {
				return;
			}
			event.preventDefault();
			this.bringToFront(windowEl);
			const startX = event.clientX;
			const startY = event.clientY;
			const startLeft = card.floatX;
			const startTop = card.floatY;
			const dragBounds = resolveFloatingBounds();

			const onPointerMove = (moveEvent: PointerEvent): void => {
				const deltaX = moveEvent.clientX - startX;
				const deltaY = moveEvent.clientY - startY;
				card.floatX = startLeft + deltaX;
				card.floatY = startTop + deltaY;
				this.applyWindowFrame(windowEl, card, true, {
					bounds: dragBounds,
					contentSurfaceEls,
				});
			};
			const onPointerUp = (): void => {
				document.removeEventListener("pointermove", onPointerMove, true);
				document.removeEventListener("pointerup", onPointerUp, true);
				removeDragListeners = null;
				this.schedulePersist(card);
			};
			document.addEventListener("pointermove", onPointerMove, true);
			document.addEventListener("pointerup", onPointerUp, true);
			removeDragListeners = () => {
				document.removeEventListener("pointermove", onPointerMove, true);
				document.removeEventListener("pointerup", onPointerUp, true);
			};
		};
		headerEl?.addEventListener("pointerdown", onHeaderPointerDown, true);

		const onResizePointerDown = (event: PointerEvent): void => {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			this.bringToFront(windowEl);
			const startX = event.clientX;
			const startY = event.clientY;
			const startWidth = card.floatW;
			const startHeight = card.floatH;
			const resizeBounds = resolveFloatingBounds();
			const onPointerMove = (moveEvent: PointerEvent): void => {
				const deltaX = moveEvent.clientX - startX;
				const deltaY = moveEvent.clientY - startY;
				card.floatW = startWidth + deltaX;
				card.floatH = startHeight + deltaY;
				this.applyWindowFrame(windowEl, card, true, {
					bounds: resizeBounds,
					contentSurfaceEls,
				});
			};
			const onPointerUp = (): void => {
				document.removeEventListener("pointermove", onPointerMove, true);
				document.removeEventListener("pointerup", onPointerUp, true);
				removeResizeListeners = null;
				this.schedulePersist(card);
			};
			document.addEventListener("pointermove", onPointerMove, true);
			document.addEventListener("pointerup", onPointerUp, true);
			removeResizeListeners = () => {
				document.removeEventListener("pointermove", onPointerMove, true);
				document.removeEventListener("pointerup", onPointerUp, true);
			};
		};
		resizeHandleEl.addEventListener("pointerdown", onResizePointerDown, true);

		return () => {
			windowEl.removeEventListener("pointerdown", bringToFront, true);
			headerEl?.removeEventListener("pointerdown", onHeaderPointerDown, true);
			resizeHandleEl.removeEventListener("pointerdown", onResizePointerDown, true);
			removeDragListeners?.();
			removeResizeListeners?.();
		};
	}

	private applyWindowFrame(
		windowEl: HTMLElement,
		card: StickyNoteCardModel,
		clampToViewport: boolean,
		options?: ApplyWindowFrameOptions,
	): void {
		const bounds = options?.bounds ?? resolveFloatingBounds();
		const viewportWidth = Math.max(1, bounds.width);
		const viewportHeight = Math.max(1, bounds.height);
		const maxWidth = Math.max(1, viewportWidth - 8);
		const minWidth = Math.min(STICKY_NOTE_FLOAT_MIN_WIDTH, maxWidth);
		const width = clamp(normalizeSize(card.floatW, STICKY_NOTE_FLOAT_DEFAULT_WIDTH), minWidth, maxWidth);
		const defaultContentHeight = resolveStickyNoteFloatDefaultHeightByRows(this.ctx.settings.stickyNoteDefaultRows);
		const contentHeight = clamp(
			normalizeSize(card.floatH, defaultContentHeight),
			STICKY_NOTE_FLOAT_MIN_HEIGHT,
			Math.max(STICKY_NOTE_FLOAT_MIN_HEIGHT, viewportHeight - 56),
		);
		let x = normalizePosition(card.floatX);
		let y = normalizePosition(card.floatY);

		windowEl.style.width = `${width}px`;
		this.applyContentSurfaceSize(windowEl, contentHeight, options?.contentSurfaceEls);

		if (clampToViewport) {
			x = clamp(x, bounds.left, Math.max(bounds.left, bounds.right - width));
		}
		windowEl.style.left = `${x}px`;
		windowEl.style.top = `${y}px`;

		if (clampToViewport) {
			const rect = windowEl.getBoundingClientRect();
			y = clamp(y, bounds.top, Math.max(bounds.top, bounds.bottom - rect.height));
			windowEl.style.top = `${y}px`;
		}

		card.floatW = width;
		card.floatH = contentHeight;
		card.floatX = x;
		card.floatY = y;
	}

	private applyContentSurfaceSize(windowEl: HTMLElement, contentHeight: number, contentSurfaceEls?: HTMLElement[]): void {
		const surfaces = contentSurfaceEls ?? collectContentSurfaceEls(windowEl);
		for (let index = 0; index < surfaces.length; index += 1) {
			const surfaceEl = surfaces[index];
			if (!surfaceEl) {
				continue;
			}
			surfaceEl.style.minHeight = `${contentHeight}px`;
			surfaceEl.style.maxHeight = `${contentHeight}px`;
		}
	}

	private bringToFront(windowEl: HTMLElement): void {
		this.zIndexSeed += 1;
		windowEl.style.zIndex = `${this.zIndexSeed}`;
	}

	private reflowWindowsIntoViewport(): void {
		for (const entry of this.floatingEntriesByPath.values()) {
			this.applyWindowFrame(entry.windowEl, entry.card, true, {
				contentSurfaceEls: entry.contentSurfaceEls,
			});
		}
	}

	private handleViewportResize(): void {
		const nextWidth = Math.max(1, window.innerWidth);
		const nextHeight = Math.max(1, window.innerHeight);
		const shouldReflow =
			this.lastViewportWidth <= 0 ||
			this.lastViewportHeight <= 0 ||
			nextWidth < this.lastViewportWidth ||
			nextHeight < this.lastViewportHeight;
		this.lastViewportWidth = nextWidth;
		this.lastViewportHeight = nextHeight;
		if (!shouldReflow) {
			return;
		}
		this.reflowWindowsIntoViewport();
	}

	private isStickyMarkdownPath(path: string): boolean {
		if (!path || !path.toLowerCase().endsWith(".md")) {
			return false;
		}
		const stickyRoots = resolveStickyRootPaths(this.ctx.settings, this.novelLibraryService);
		return stickyRoots.some((rootPath) => this.novelLibraryService.isSameOrChildPath(path, rootPath));
	}

	private flashStickyNoteTabIfNeeded(): void {
		if (isStickyNoteTabActiveInRightSidebar()) {
			return;
		}
		const tabHeaders = queryStickyNoteTabHeadersInRightSidebar();
		if (tabHeaders.length === 0) {
			return;
		}
		for (let index = 0; index < tabHeaders.length; index += 1) {
			const tabHeaderEl = tabHeaders[index];
			if (!tabHeaderEl) {
				continue;
			}
			tabHeaderEl.classList.remove(STICKY_TAB_FLASH_CLASS);
			void tabHeaderEl.offsetWidth;
			tabHeaderEl.classList.add(STICKY_TAB_FLASH_CLASS);
		}
		const clearDelay = STICKY_TAB_FLASH_DURATION_MS * STICKY_TAB_FLASH_ITERATIONS + 40;
		window.setTimeout(() => {
			const latestHeaders = queryStickyNoteTabHeadersInRightSidebar();
			for (let index = 0; index < latestHeaders.length; index += 1) {
				latestHeaders[index]?.classList.remove(STICKY_TAB_FLASH_CLASS);
			}
		}, clearDelay);
	}
}

function resolveStickyRootPaths(
	settings: PluginContext["settings"],
	novelLibraryService: NovelLibraryService,
): string[] {
	const roots = settings.novelLibraries
		.map((libraryPath) =>
			novelLibraryService.resolveNovelLibrarySubdirPath(
				settings,
				libraryPath,
				settings.stickyNoteDirName,
			),
		)
		.map((path) => novelLibraryService.normalizeVaultPath(path))
		.filter((path) => path.length > 0);
	return Array.from(new Set(roots));
}

function normalizeSize(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function normalizePosition(value: number): number {
	return Number.isFinite(value) ? Math.round(value) : 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function resolveFloatingBounds(): FloatingBounds {
	const left = 0;
	let top = 0;
	let right = Math.max(1, window.innerWidth);
	const bottom = Math.max(1, window.innerHeight);
	const titleBarEl = document.querySelector<HTMLElement>(".titlebar");
	if (titleBarEl && titleBarEl.isConnected) {
		const rect = titleBarEl.getBoundingClientRect();
		if (rect.height > 0) {
			top = Math.max(0, Math.floor(rect.bottom));
		}
	}
	const rightSplitEl = document.querySelector<HTMLElement>(".workspace-split.mod-right-split");
	if (rightSplitEl && rightSplitEl.isConnected) {
		const rect = rightSplitEl.getBoundingClientRect();
		const splitWidth = rect.width;
		if (splitWidth > 4 && rect.left >= 0 && rect.left < right) {
			right = Math.max(1, Math.floor(rect.left));
		}
	}
	const width = Math.max(1, right - left);
	const height = Math.max(1, bottom - top);
	return { left, top, right, bottom, width, height };
}

function collectContentSurfaceEls(windowEl: HTMLElement): HTMLElement[] {
	const surfaces = windowEl.querySelectorAll<HTMLElement>(".cna-sticky-note-card__content-section .cna-sticky-note-card__surface");
	const result: HTMLElement[] = [];
	for (let index = 0; index < surfaces.length; index += 1) {
		const surfaceEl = surfaces[index];
		if (surfaceEl) {
			result.push(surfaceEl);
		}
	}
	return result;
}

function queryStickyNoteTabHeadersInRightSidebar(): HTMLElement[] {
	const selector = `.workspace-split.mod-right-split .workspace-tab-header[data-type="${IDS.view.stickyNoteSidebar}"]`;
	const matched = document.querySelectorAll<HTMLElement>(selector);
	const headers: HTMLElement[] = [];
	for (let index = 0; index < matched.length; index += 1) {
		const headerEl = matched[index];
		if (headerEl) {
			headers.push(headerEl);
		}
	}
	return headers;
}

function isStickyNoteTabActiveInRightSidebar(): boolean {
	const selector = `.workspace-split.mod-right-split .workspace-tab-header.is-active[data-type="${IDS.view.stickyNoteSidebar}"]`;
	return document.querySelector(selector) !== null;
}
