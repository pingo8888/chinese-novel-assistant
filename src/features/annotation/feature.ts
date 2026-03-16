import { Annotation, RangeSetBuilder, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Editor, MarkdownFileInfo, MarkdownView, Menu, MenuItem, Notice, Plugin, TFile } from "obsidian";
import { UI, type PluginContext, bindVaultChangeWatcher } from "../../core";
import { normalizeVaultPath } from "../../core/novel-library-service";
import { parseColorHex, resolveEditorViewFromMarkdownView, resolveMarkdownViewByEditorView, toRgba } from "../../utils";
import { type AnnotationAnchorSnapshot, type AnnotationSelectionAnchor, AnnotationRepository } from "./repository";
import { emitAnnotationCreated, subscribeAnnotationLocateFlash, type AnnotationLocateFlashPayload } from "./flash-bus";
import { scheduleAttachColorSwatchesToLatestMenu } from "../../ui";
import { ANNOTATION_COLOR_TYPES, DEFAULT_ANNOTATION_COLOR, normalizeAnnotationColorHex } from "./color-types";

const ANNOTATION_RANGE_FORCE_REFRESH = Annotation.define<boolean>();
const ANNOTATION_RANGE_MARK_CLASS = "cna-annotation-range-mark";
const ANNOTATION_RANGE_FLASH_CLASS = "cna-annotation-range-mark--flash";
const ANNOTATION_RANGE_FLASH_DURATION_MS = 1300;
const ANNOTATION_SELF_MODIFY_SUPPRESS_MS = 1000;
const ANNOTATION_CREATE_MENU_SECTION = "cna-annotation-create-type";

interface AnnotationRangeSnapshot {
	id: string;
	from: number;
	to: number;
	colorHex?: string;
}

export function registerAnnotationFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new AnnotationFeature(plugin, ctx);
	feature.onload();
}

class AnnotationFeature {
	private readonly plugin: Plugin;
	private readonly ctx: PluginContext;
	private readonly repository: AnnotationRepository;
	private readonly anchorSnapshotsBySourcePath = new Map<string, Map<string, AnnotationAnchorSnapshot>>();
	private readonly anchorSaveTimerBySourcePath = new Map<string, number>();
	private readonly anchorQueueBySourcePath = new Map<string, Promise<void>>();
	private readonly loadingAnchorPaths = new Set<string>();
	private readonly loadedAnchorPaths = new Set<string>();
	private readonly annotationModifySuppressUntilByPath = new Map<string, number>();
	private locateFlashState: { sourcePath: string; annotationId: string } | null = null;
	private locateFlashTimer: number | null = null;
	private isUnloaded = false;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
		this.repository = new AnnotationRepository(plugin.app);
	}

	onload(): void {
		this.plugin.registerEvent(this.plugin.app.workspace.on("editor-menu", this.onEditorMenu));
		this.plugin.registerEditorExtension(
			EditorView.updateListener.of((update: ViewUpdate) => {
				if (!update.docChanged) {
					return;
				}
				this.handleEditorDocChanged(update);
			}),
		);
		this.plugin.registerEditorExtension(createAnnotationRangeExtension({
			plugin: this.plugin,
			getSettings: () => this.ctx.settings,
			isManagedSourcePath: (path) => this.repository.isManagedSourceFile(this.ctx.settings, path),
			getCachedRanges: (sourcePath) => this.getCachedRanges(sourcePath),
			isRangeFlashing: (sourcePath, annotationId) => this.isRangeFlashing(sourcePath, annotationId),
			requestAnchorSnapshotsLoad: (sourcePath) => this.requestAnchorSnapshotsLoad(sourcePath),
		}));
		const unsubscribeLocateFlash = subscribeAnnotationLocateFlash((payload) => {
			this.onLocateFlash(payload);
		});
		this.plugin.register(() => {
			unsubscribeLocateFlash();
		});

		this.plugin.registerEvent(this.plugin.app.workspace.on("file-open", (file) => {
			this.handleActiveFileChanged(file?.path ?? "");
		}));
		this.plugin.registerEvent(this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
			const view = leaf?.view;
			if (!(view instanceof MarkdownView)) {
				return;
			}
			this.handleActiveFileChanged(view.file?.path ?? "");
		}));

		bindVaultChangeWatcher(this.plugin, this.plugin.app, (event) => {
			void this.handleVaultChange(event);
		});

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.clearAnchorTrackingState();
			this.handleActiveFileChanged(this.plugin.app.workspace.getActiveFile()?.path ?? "");
			this.refreshRangeDecorations();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});

		this.handleActiveFileChanged(this.plugin.app.workspace.getActiveFile()?.path ?? "");
		this.refreshRangeDecorations();

		this.plugin.register(() => {
			this.unload();
		});
	}

	private readonly onEditorMenu = (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void => {
		if (!this.ctx.settings.annotationEnabled) {
			return;
		}
		const filePath = resolveFilePathFromMenuInfo(info);
		if (!filePath || !this.repository.isManagedSourceFile(this.ctx.settings, filePath)) {
			return;
		}
		const selection = resolveSelectionAnchor(editor, info);
		if (!selection) {
			return;
		}
		const annotationTypeItems = ANNOTATION_COLOR_TYPES.map((colorType) => ({
			title: this.ctx.t(colorType.labelKey),
			colorHex: colorType.colorHex,
		}));
		const stopColorSwatchObserver = observeAnnotationTypeColorSwatches(annotationTypeItems);
		menu.onHide(() => {
			stopColorSwatchObserver();
		});
		menu.addItem((item) => {
			item
				.setTitle(this.ctx.t("feature.annotation.editor_menu.create"))
				.setIcon(UI.ICON.HIGHLIGHTER);
			if (attachSubmenuByBuilder(item, (submenu) => {
				for (const annotationTypeItem of annotationTypeItems) {
					submenu.addItem((submenuItem) => {
						submenuItem
							.setTitle(annotationTypeItem.title)
							.setSection(ANNOTATION_CREATE_MENU_SECTION)
							.onClick(() => {
								void this.createAnnotationBySelection(filePath, selection, annotationTypeItem.colorHex);
							});
					});
				}
			})) {
				return;
			}
			item.onClick(() => {
				void this.createAnnotationBySelection(filePath, selection, DEFAULT_ANNOTATION_COLOR);
			});
		});
	};

	private async createAnnotationBySelection(
		sourcePath: string,
		selection: AnnotationSelectionAnchor,
		colorHex?: string,
	): Promise<void> {
		try {
			const createdCard = await this.repository.createEntryAtSelection(
				this.ctx.settings,
				sourcePath,
				selection,
				this.ctx.t("feature.annotation.default_title"),
				colorHex,
			);
			const normalizedPath = normalizeVaultPath(sourcePath);
			this.anchorSnapshotsBySourcePath.delete(normalizedPath);
			this.loadedAnchorPaths.delete(normalizedPath);
			this.requestAnchorSnapshotsLoad(normalizedPath);
			this.refreshRangeDecorations();
			emitAnnotationCreated({
				sourcePath: normalizeVaultPath(createdCard.sourcePath),
				annotationPath: normalizeVaultPath(createdCard.annoPath),
				annotationId: createdCard.id,
			});
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to create annotation.", error);
			new Notice(this.ctx.t("feature.annotation.notice.create_failed"));
		}
	}

	private handleEditorDocChanged(update: ViewUpdate): void {
		if (this.isUnloaded || !this.ctx.settings.annotationEnabled) {
			return;
		}
		const markdownView = resolveMarkdownViewByEditorView(this.plugin.app, update.view);
		const sourcePath = markdownView?.file?.path ?? "";
		if (!sourcePath || !this.repository.isManagedSourceFile(this.ctx.settings, sourcePath)) {
			return;
		}
		const normalizedSourcePath = normalizeVaultPath(sourcePath);
		this.enqueueAnchorChange(normalizedSourcePath, update.changes, update.state.doc);
	}

	private enqueueAnchorChange(sourcePath: string, changes: ViewUpdate["changes"], doc: Text): void {
		const previousTask = this.anchorQueueBySourcePath.get(sourcePath) ?? Promise.resolve();
		const nextTask = previousTask
			.then(async () => {
				const snapshots = await this.ensureAnchorSnapshots(sourcePath);
				let hasChanged = false;
				for (const [id, snapshot] of Array.from(snapshots.entries())) {
					const mappedStart = clampOffset(changes.mapPos(snapshot.anchorOffset, -1), doc.length);
					const mappedEnd = clampOffset(changes.mapPos(snapshot.anchorEndOffset, -1), doc.length);
					if (mappedEnd <= mappedStart) {
						snapshots.delete(id);
						hasChanged = true;
						continue;
					}
					const lineInfo = doc.lineAt(mappedStart);
					const nextLine = Math.max(0, lineInfo.number - 1);
					const nextCh = Math.max(0, mappedStart - lineInfo.from);
					if (
						snapshot.anchorOffset !== mappedStart ||
						snapshot.anchorEndOffset !== mappedEnd ||
						snapshot.line !== nextLine ||
						snapshot.ch !== nextCh
					) {
						hasChanged = true;
						snapshot.anchorOffset = mappedStart;
						snapshot.anchorEndOffset = mappedEnd;
						snapshot.line = nextLine;
						snapshot.ch = nextCh;
					}
				}
				if (hasChanged) {
					this.scheduleAnchorFlush(sourcePath);
					this.refreshRangeDecorations();
				}
			})
			.catch((error) => {
				console.error("[Chinese Novel Assistant] Failed to map annotation anchors.", error);
			});
		this.anchorQueueBySourcePath.set(sourcePath, nextTask);
	}

	private async ensureAnchorSnapshots(sourcePath: string): Promise<Map<string, AnnotationAnchorSnapshot>> {
		const cached = this.anchorSnapshotsBySourcePath.get(sourcePath);
		if (cached) {
			return cached;
		}
		const snapshots = await this.repository.getAnchorsForSourcePath(this.ctx.settings, sourcePath);
		this.anchorSnapshotsBySourcePath.set(sourcePath, snapshots);
		this.loadedAnchorPaths.add(sourcePath);
		return snapshots;
	}

	private scheduleAnchorFlush(sourcePath: string): void {
		const existingTimer = this.anchorSaveTimerBySourcePath.get(sourcePath);
		if (existingTimer !== undefined) {
			window.clearTimeout(existingTimer);
		}
		const timer = window.setTimeout(() => {
			this.anchorSaveTimerBySourcePath.delete(sourcePath);
			void this.flushAnchorSnapshots(sourcePath);
		}, 240);
		this.anchorSaveTimerBySourcePath.set(sourcePath, timer);
	}

	private async flushAnchorSnapshots(sourcePath: string): Promise<void> {
		if (this.isUnloaded) {
			return;
		}
		const snapshots = this.anchorSnapshotsBySourcePath.get(sourcePath);
		if (!snapshots) {
			return;
		}
		try {
			await this.repository.patchAnchorsForSourcePath(this.ctx.settings, sourcePath, snapshots);
			const annotationPath = this.repository.resolveAnnotationPathBySourcePath(this.ctx.settings, sourcePath);
			if (annotationPath) {
				this.annotationModifySuppressUntilByPath.set(annotationPath, Date.now() + ANNOTATION_SELF_MODIFY_SUPPRESS_MS);
			}
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to persist annotation anchors.", error);
		}
	}

	private requestAnchorSnapshotsLoad(sourcePath: string): void {
		if (this.isUnloaded || !this.ctx.settings.annotationEnabled) {
			return;
		}
		const normalizedPath = normalizeVaultPath(sourcePath);
		if (!normalizedPath || !this.repository.isManagedSourceFile(this.ctx.settings, normalizedPath)) {
			return;
		}
		if (
			this.anchorSnapshotsBySourcePath.has(normalizedPath) ||
			this.loadingAnchorPaths.has(normalizedPath) ||
			this.loadedAnchorPaths.has(normalizedPath)
		) {
			return;
		}
		this.loadingAnchorPaths.add(normalizedPath);
		void this.ensureAnchorSnapshots(normalizedPath)
			.catch((error) => {
				console.error("[Chinese Novel Assistant] Failed to load annotation anchors.", error);
			})
			.finally(() => {
				this.loadingAnchorPaths.delete(normalizedPath);
				this.loadedAnchorPaths.add(normalizedPath);
				this.refreshRangeDecorations();
			});
	}

	private handleActiveFileChanged(filePath: string): void {
		const normalizedPath = normalizeVaultPath(filePath);
		if (!normalizedPath || !this.repository.isManagedSourceFile(this.ctx.settings, normalizedPath)) {
			this.refreshRangeDecorations();
			return;
		}
		this.requestAnchorSnapshotsLoad(normalizedPath);
		this.refreshRangeDecorations();
	}

	private getCachedRanges(sourcePath: string): AnnotationRangeSnapshot[] {
		const snapshots = this.anchorSnapshotsBySourcePath.get(sourcePath);
		if (!snapshots || snapshots.size === 0) {
			return [];
		}
		const ranges: AnnotationRangeSnapshot[] = [];
		for (const [id, snapshot] of snapshots.entries()) {
			ranges.push({
				id,
				from: Math.max(0, Math.round(snapshot.anchorOffset)),
				to: Math.max(0, Math.round(snapshot.anchorEndOffset)),
				colorHex: snapshot.colorHex,
			});
		}
		return ranges.sort((left, right) => {
			if (left.from !== right.from) {
				return left.from - right.from;
			}
			if (left.to !== right.to) {
				return left.to - right.to;
			}
			return left.id.localeCompare(right.id);
		});
	}
	private isRangeFlashing(sourcePath: string, annotationId: string): boolean {
		const state = this.locateFlashState;
		if (!state) {
			return false;
		}
		return state.sourcePath === sourcePath && state.annotationId === annotationId;
	}

	private onLocateFlash(payload: AnnotationLocateFlashPayload): void {
		if (this.isUnloaded || !this.ctx.settings.annotationEnabled) {
			return;
		}
		const sourcePath = normalizeVaultPath(payload.sourcePath);
		const annotationId = payload.annotationId.trim();
		if (!sourcePath || !annotationId) {
			return;
		}
		if (!this.repository.isManagedSourceFile(this.ctx.settings, sourcePath)) {
			return;
		}
		this.locateFlashState = {
			sourcePath,
			annotationId,
		};
		if (this.locateFlashTimer !== null) {
			window.clearTimeout(this.locateFlashTimer);
		}
		this.locateFlashTimer = window.setTimeout(() => {
			this.locateFlashTimer = null;
			this.locateFlashState = null;
			this.refreshRangeDecorations();
		}, ANNOTATION_RANGE_FLASH_DURATION_MS);
		this.refreshRangeDecorations();
	}

	private refreshRangeDecorations(): void {
		if (this.isUnloaded) {
			return;
		}
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView)) {
				continue;
			}
			const editorView = resolveEditorViewFromMarkdownView(leaf.view);
			if (!editorView) {
				continue;
			}
			editorView.dispatch({
				annotations: ANNOTATION_RANGE_FORCE_REFRESH.of(true),
			});
		}
	}

	private async handleVaultChange(event: {
		type: "create" | "modify" | "delete" | "rename";
		file: unknown;
		path: string;
		oldPath?: string;
	}): Promise<void> {
		if (this.isUnloaded) {
			return;
		}
		if (isAnnotationFilePath(event.path) || isAnnotationFilePath(event.oldPath ?? "")) {
			const annotationPath = normalizeVaultPath(event.path);
			if (event.type === "modify") {
				if (this.shouldSuppressAnnotationModifyReload(annotationPath)) {
					return;
				}
				this.reloadActiveSourceAnchorsForAnnotationPath(annotationPath);
				return;
			}
			this.annotationModifySuppressUntilByPath.delete(annotationPath);
			this.clearAnchorTrackingState();
			this.handleActiveFileChanged(this.plugin.app.workspace.getActiveFile()?.path ?? "");
			return;
		}

		if (!(event.file instanceof TFile)) {
			return;
		}

		const path = normalizeVaultPath(event.path);
		if (!path.toLowerCase().endsWith(".md") || path.toLowerCase().endsWith(".anno.md")) {
			return;
		}

		switch (event.type) {
			case "rename": {
				const oldPath = normalizeVaultPath(event.oldPath ?? "");
				if (!oldPath) {
					return;
				}
				try {
					await this.repository.migrateSourcePath(this.ctx.settings, oldPath, path);
					const oldSnapshots = this.anchorSnapshotsBySourcePath.get(oldPath);
					if (oldSnapshots) {
						this.anchorSnapshotsBySourcePath.delete(oldPath);
						this.anchorSnapshotsBySourcePath.set(path, oldSnapshots);
					}
					if (this.loadedAnchorPaths.has(oldPath)) {
						this.loadedAnchorPaths.delete(oldPath);
						this.loadedAnchorPaths.add(path);
					}
					this.loadingAnchorPaths.delete(oldPath);
					this.cancelAnchorFlush(oldPath);
					this.refreshRangeDecorations();
				} catch (error) {
					console.error("[Chinese Novel Assistant] Failed to migrate annotation file.", error);
				}
				return;
			}
			case "delete": {
				try {
					await this.repository.deleteAnnotationFileBySourcePath(this.ctx.settings, path);
					this.anchorSnapshotsBySourcePath.delete(path);
					this.loadingAnchorPaths.delete(path);
					this.loadedAnchorPaths.delete(path);
					this.cancelAnchorFlush(path);
					this.refreshRangeDecorations();
				} catch (error) {
					console.error("[Chinese Novel Assistant] Failed to delete annotation file.", error);
				}
				return;
			}
			default:
				return;
		}
	}

	private shouldSuppressAnnotationModifyReload(annotationPath: string): boolean {
		const suppressUntil = this.annotationModifySuppressUntilByPath.get(annotationPath);
		if (suppressUntil === undefined) {
			return false;
		}
		if (Date.now() <= suppressUntil) {
			return true;
		}
		this.annotationModifySuppressUntilByPath.delete(annotationPath);
		return false;
	}

	private reloadActiveSourceAnchorsForAnnotationPath(annotationPath: string): void {
		const activeSourcePath = normalizeVaultPath(this.plugin.app.workspace.getActiveFile()?.path ?? "");
		if (!activeSourcePath || !this.repository.isManagedSourceFile(this.ctx.settings, activeSourcePath)) {
			return;
		}
		const activeAnnotationPath = this.repository.resolveAnnotationPathBySourcePath(this.ctx.settings, activeSourcePath);
		if (!activeAnnotationPath || normalizeVaultPath(activeAnnotationPath) !== annotationPath) {
			return;
		}
		this.anchorSnapshotsBySourcePath.delete(activeSourcePath);
		this.loadingAnchorPaths.delete(activeSourcePath);
		this.loadedAnchorPaths.delete(activeSourcePath);
		void this.ensureAnchorSnapshots(activeSourcePath)
			.then(() => {
				if (!this.isUnloaded) {
					this.refreshRangeDecorations();
				}
			})
			.catch((error) => {
				console.error("[Chinese Novel Assistant] Failed to reload annotation anchors.", error);
			});
	}

	private cancelAnchorFlush(sourcePath: string): void {
		const timer = this.anchorSaveTimerBySourcePath.get(sourcePath);
		if (timer === undefined) {
			return;
		}
		window.clearTimeout(timer);
		this.anchorSaveTimerBySourcePath.delete(sourcePath);
	}

	private clearAnchorTrackingState(): void {
		for (const timer of this.anchorSaveTimerBySourcePath.values()) {
			window.clearTimeout(timer);
		}
		this.anchorSaveTimerBySourcePath.clear();
		this.anchorSnapshotsBySourcePath.clear();
		this.anchorQueueBySourcePath.clear();
		this.loadingAnchorPaths.clear();
		this.loadedAnchorPaths.clear();
		this.annotationModifySuppressUntilByPath.clear();
		this.locateFlashState = null;
		if (this.locateFlashTimer !== null) {
			window.clearTimeout(this.locateFlashTimer);
			this.locateFlashTimer = null;
		}
	}

	private unload(): void {
		if (this.isUnloaded) {
			return;
		}
		this.isUnloaded = true;
		this.clearAnchorTrackingState();
		this.refreshRangeDecorations();
	}
}

interface MenuItemWithSubmenu {
	setSubmenu?: (...args: unknown[]) => unknown;
	submenu?: Menu;
}

interface AnnotationRangeExtensionDeps {
	plugin: Plugin;
	getSettings: () => PluginContext["settings"];
	isManagedSourcePath: (path: string) => boolean;
	getCachedRanges: (sourcePath: string) => AnnotationRangeSnapshot[];
	isRangeFlashing: (sourcePath: string, annotationId: string) => boolean;
	requestAnchorSnapshotsLoad: (sourcePath: string) => void;
}

function createAnnotationRangeExtension(deps: AnnotationRangeExtensionDeps) {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildAnnotationRangeDecorations(view, deps);
			}

			update(update: ViewUpdate): void {
				const forced = update.transactions.some((tr) => tr.annotation(ANNOTATION_RANGE_FORCE_REFRESH));
				if (forced || update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.decorations = buildAnnotationRangeDecorations(update.view, deps);
				}
			}
		},
	);

	return [
		plugin,
		EditorView.outerDecorations.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
	];
}

function buildAnnotationRangeDecorations(view: EditorView, deps: AnnotationRangeExtensionDeps): DecorationSet {
	if (!deps.getSettings().annotationEnabled) {
		return Decoration.none;
	}
	const markdownView = resolveMarkdownViewByEditorView(deps.plugin.app, view);
	const sourcePath = normalizeVaultPath(markdownView?.file?.path ?? "");
	if (!sourcePath || !deps.isManagedSourcePath(sourcePath)) {
		return Decoration.none;
	}
	const ranges = deps.getCachedRanges(sourcePath);
	if (ranges.length === 0) {
		deps.requestAnchorSnapshotsLoad(sourcePath);
		return Decoration.none;
	}
	const maxOffset = view.state.doc.length;
	const builder = new RangeSetBuilder<Decoration>();
	for (const range of ranges) {
		const from = clampOffset(Math.min(range.from, range.to), maxOffset);
		const to = clampOffset(Math.max(range.from, range.to), maxOffset);
		if (to <= from) {
			continue;
		}
		const className = deps.isRangeFlashing(sourcePath, range.id)
			? ANNOTATION_RANGE_MARK_CLASS + " " + ANNOTATION_RANGE_FLASH_CLASS
			: ANNOTATION_RANGE_MARK_CLASS;
		const colorHex = normalizeAnnotationColorHex(parseColorHex(range.colorHex) ?? DEFAULT_ANNOTATION_COLOR);
		builder.add(from, to, Decoration.mark({
			class: className,
			attributes: buildAnnotationRangeColorAttributes(colorHex),
		}));
	}
	return builder.finish();
}
function buildAnnotationRangeColorAttributes(colorHex: string): Record<string, string> {
	return {
		style: [
			`--cna-annotation-range-color: ${colorHex}`,
			`--cna-annotation-range-color-alpha: ${toRgba(colorHex, 0.25)}`,
			`--cna-annotation-range-color-alpha-strong: ${toRgba(colorHex, 0.56)}`,
		].join("; "),
	};
}

function observeAnnotationTypeColorSwatches(
	items: Array<{ title: string; colorHex: string }>,
): () => void {
	if (items.length === 0) {
		return () => {};
	}
	const swatchOptions = items.map((item) => ({
		title: item.title,
		colorHex: item.colorHex,
		useIconSlot: true,
	}));
	scheduleAttachColorSwatchesToLatestMenu(swatchOptions);
	const observer = new MutationObserver(() => {
		scheduleAttachColorSwatchesToLatestMenu(swatchOptions);
	});
	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
	return () => {
		observer.disconnect();
	};
}

function attachSubmenuByBuilder(
	item: MenuItem,
	builder: (submenu: Menu) => void,
): boolean {
	const menuItemAny = item as unknown as MenuItemWithSubmenu;
	if (typeof menuItemAny.setSubmenu !== "function") {
		return false;
	}
	try {
		menuItemAny.setSubmenu();
		if (menuItemAny.submenu) {
			builder(menuItemAny.submenu);
			return true;
		}
	} catch {
		// Fall through and try legacy signature.
	}
	const legacySubmenu = new Menu();
	builder(legacySubmenu);
	try {
		menuItemAny.setSubmenu(legacySubmenu);
		return true;
	} catch {
		return false;
	}
}

function resolveSelectionAnchor(editor: Editor, info: MarkdownView | MarkdownFileInfo): AnnotationSelectionAnchor | null {

	if (info instanceof MarkdownView) {
		const editorView = resolveEditorViewFromMarkdownView(info);
		const mainSelection = editorView?.state.selection.main;
		if (mainSelection && !mainSelection.empty) {
			const fromOffset = Math.max(0, Math.round(mainSelection.from));
			const toOffset = Math.max(0, Math.round(mainSelection.to));
			const fromPos = editor.offsetToPos(fromOffset);
			return {
				line: Math.max(0, fromPos.line),
				ch: Math.max(0, fromPos.ch),
				fromOffset,
				toOffset,
			};
		}
	}

	const fromPos = editor.getCursor("from");
	const toPos = editor.getCursor("to");
	const fromOffset = Math.max(0, editor.posToOffset(fromPos));
	const toOffset = Math.max(0, editor.posToOffset(toPos));
	if (toOffset <= fromOffset) {
		return null;
	}
	return {
		line: Math.max(0, fromPos.line),
		ch: Math.max(0, fromPos.ch),
		fromOffset,
		toOffset,
	};
}

function resolveFilePathFromMenuInfo(info: MarkdownView | MarkdownFileInfo): string {
	if (info instanceof MarkdownView) {
		return info.file?.path ?? "";
	}
	const infoWithFile = info as MarkdownFileInfo & { file?: { path?: string } | null };
	return infoWithFile.file?.path ?? "";
}

function clampOffset(offset: number, docLength: number): number {
	return Math.max(0, Math.min(Math.round(offset), docLength));
}

function isAnnotationFilePath(path: string): boolean {
	return normalizeVaultPath(path).toLowerCase().endsWith(".anno.md");
}




