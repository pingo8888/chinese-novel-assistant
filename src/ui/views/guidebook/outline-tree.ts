import { setIcon } from "obsidian";
import { UI } from "../../../core/constants";
import type { GuidebookTreeDragMoveRequest } from "../../../features/guidebook/drag-sort-actions";
import type {
	GuidebookTreeData,
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
	GuidebookTreeH2Node,
} from "../../../features/guidebook/tree-builder";
import {
	openGuidebookBlankContextMenu,
	openGuidebookFileContextMenu,
	openGuidebookH1ContextMenu,
	openGuidebookH2ContextMenu,
	type GuidebookContextMenuLabels,
	type GuidebookTreeFileContextAction,
	type GuidebookTreeH1ContextAction,
	type GuidebookTreeH2ContextAction,
} from "./context-menu";

export interface GuidebookTreeViewComponent {
	setAllExpanded(expanded: boolean): void;
	renderLoading(text: string): void;
	renderData(data: GuidebookTreeData | null, emptyText: string): void;
	destroy(): void;
}

export interface GuidebookTreeExpandedStateSnapshot {
	allExpanded: boolean;
	nodeExpandedState: Record<string, boolean>;
}

interface GuidebookTreeViewOptions {
	menuLabels: GuidebookContextMenuLabels;
	initialExpandedState?: Record<string, boolean>;
	initialAllExpanded?: boolean;
	onExpandedStateChange?: (snapshot: GuidebookTreeExpandedStateSnapshot) => void;
	onMove?: (request: GuidebookTreeDragMoveRequest) => Promise<boolean> | boolean;
	onFileContextAction?: (action: GuidebookTreeFileContextAction, fileNode: GuidebookTreeFileNode) => void;
	onH1ContextAction?: (
		action: GuidebookTreeH1ContextAction,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
	) => void;
	onH2ContextAction?: (
		action: GuidebookTreeH2ContextAction,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
		h2Node: GuidebookTreeH2Node,
	) => void;
	onBlankContextCreateCollection?: () => void;
}

type DragTreeNodePayload =
	| {
			kind: "file";
			fileNode: GuidebookTreeFileNode;
	  }
	| {
			kind: "h1";
			fileNode: GuidebookTreeFileNode;
			h1Node: GuidebookTreeH1Node;
	  }
	| {
			kind: "h2";
			fileNode: GuidebookTreeFileNode;
			h1Node: GuidebookTreeH1Node;
			h2Node: GuidebookTreeH2Node;
	  };

type DropIndicator = "before" | "after" | "inside";
const INACTIVE_STATUS_PATTERN = /【状态】\s*(死亡|失效)/;
const SIDEBAR_PREVIEW_ITEM_PROP = "__cnaGuidebookPreviewItem";
const STATE_KEY_SCOPE_SEPARATOR = "::";
const STATE_KEY_PATH_SEPARATOR = "||";

interface SidebarGuidebookPreviewItemPayload {
	keyword: string;
	title: string;
	categoryTitle: string;
	content: string;
	sourcePath: string;
}

type SidebarPreviewCarrierElement = HTMLElement & {
	[SIDEBAR_PREVIEW_ITEM_PROP]?: SidebarGuidebookPreviewItemPayload;
};

export function createGuidebookTreeViewComponent(
	containerEl: HTMLElement,
	options: GuidebookTreeViewOptions,
): GuidebookTreeViewComponent {
	return new GuidebookTreeView(containerEl, options);
}

class GuidebookTreeView implements GuidebookTreeViewComponent {
	private readonly viewportEl: HTMLElement;
	private readonly rootEl: HTMLElement;
	private readonly options: GuidebookTreeViewOptions;
	private readonly nodeExpandedState = new Map<string, boolean>();
	private readonly onViewportContextMenu: (event: MouseEvent) => void;
	private dragPayload: DragTreeNodePayload | null = null;
	private dragSourceRowEl: HTMLElement | null = null;
	private dropIndicatorRowEl: HTMLElement | null = null;
	private dropIndicatorClassName = "";
	private handlingDrop = false;
	private allExpanded: boolean;
	private lastData: GuidebookTreeData | null = null;
	private lastEmptyText = "";

	constructor(containerEl: HTMLElement, options: GuidebookTreeViewOptions) {
		this.viewportEl = containerEl;
		this.rootEl = containerEl.createDiv({ cls: "cna-guidebook-tree" });
		this.options = options;
		this.allExpanded = options.initialAllExpanded ?? true;
		if (options.initialExpandedState) {
			for (const [key, value] of Object.entries(options.initialExpandedState)) {
				this.nodeExpandedState.set(key, value);
			}
		}
		this.onViewportContextMenu = (event: MouseEvent) => {
			const targetEl = event.target instanceof Element ? event.target : null;
			if (targetEl?.closest(".cna-guidebook-tree__row")) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			openGuidebookBlankContextMenu(event, this.options.menuLabels, this.options.onBlankContextCreateCollection);
		};
		this.viewportEl.addEventListener("contextmenu", this.onViewportContextMenu);
	}

	setAllExpanded(expanded: boolean): void {
		this.allExpanded = expanded;
		for (const key of this.nodeExpandedState.keys()) {
			this.nodeExpandedState.set(key, expanded);
		}
		this.emitExpandedStateChange();
		if (this.lastData) {
			this.renderData(this.lastData, this.lastEmptyText);
		}
	}

	renderLoading(text: string): void {
		this.clearDragState();
		this.rootEl.empty();
		this.rootEl.createDiv({
			cls: "cna-guidebook-tree__empty",
			text,
		});
	}

	renderData(data: GuidebookTreeData | null, emptyText: string): void {
		this.lastData = data;
		this.lastEmptyText = emptyText;
		this.clearDragState();
		this.rootEl.empty();

		if (!data || data.files.length === 0) {
			this.rootEl.createDiv({
				cls: "cna-guidebook-tree__empty",
				text: emptyText,
			});
			return;
		}

		const scopeKeyPrefix = `${data.libraryRootPath}${STATE_KEY_SCOPE_SEPARATOR}`;
		const knownScopeKeys = new Set<string>();
		data.files.forEach((fileNode) => {
			const fileKey = this.buildFileStateKey(data.libraryRootPath, fileNode);
			knownScopeKeys.add(fileKey);
			const fileBranchEl = this.rootEl.createDiv({ cls: "cna-guidebook-tree__branch cna-guidebook-tree__branch--file" });
			const fileRender = this.renderCollapsibleRow(
				fileBranchEl,
				{
					label: fileNode.fileName,
					icon: UI.ICON.FILE,
					count: fileNode.h2Count,
					levelClass: "cna-guidebook-tree__row--file",
					onContextMenu: (event) => {
						openGuidebookFileContextMenu(event, this.options.menuLabels, fileNode, this.options.onFileContextAction);
					},
				},
				fileKey,
			);
			this.bindDragAndDrop(fileRender.rowEl, { kind: "file", fileNode });
			const fileChildrenEl = fileRender.childrenEl;

				fileNode.h1List.forEach((h1Node) => {
					this.renderH1Node(fileChildrenEl, data.libraryRootPath, fileNode, h1Node, knownScopeKeys);
				});
		});
		this.pruneExpandedStateByScope(scopeKeyPrefix, knownScopeKeys);
	}

	destroy(): void {
		this.viewportEl.removeEventListener("contextmenu", this.onViewportContextMenu);
		this.clearDragState();
		this.rootEl.empty();
		this.nodeExpandedState.clear();
	}

	private renderH1Node(
		containerEl: HTMLElement,
		libraryRootPath: string,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
		knownScopeKeys: Set<string>,
	): void {
		const h1Key = this.buildH1StateKey(libraryRootPath, h1Node);
		knownScopeKeys.add(h1Key);
		const h1BranchEl = containerEl.createDiv({ cls: "cna-guidebook-tree__branch cna-guidebook-tree__branch--h1" });
		const h1Render = this.renderCollapsibleRow(
			h1BranchEl,
			{
				label: h1Node.title,
				icon: UI.ICON.H1,
				count: h1Node.h2List.length,
				levelClass: "cna-guidebook-tree__row--h1",
				onContextMenu: (event) => {
					openGuidebookH1ContextMenu(
						event,
						this.options.menuLabels,
						fileNode,
						h1Node,
						this.options.onH1ContextAction,
					);
				},
			},
			h1Key,
		);
		this.bindDragAndDrop(h1Render.rowEl, { kind: "h1", fileNode, h1Node });
		const h1ChildrenEl = h1Render.childrenEl;

		h1Node.h2List.forEach((h2Node) => {
			this.renderH2Node(h1ChildrenEl, fileNode, h1Node, h2Node);
		});
	}

	private renderH2Node(
		containerEl: HTMLElement,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
		h2Node: GuidebookTreeH2Node,
	): void {
		const rowEl = containerEl.createDiv({ cls: "cna-guidebook-tree__row cna-guidebook-tree__row--h2" });
		const normalizedKeyword = h2Node.title.trim();
		if (normalizedKeyword.length > 0) {
			const previewItem: SidebarGuidebookPreviewItemPayload = {
				keyword: normalizedKeyword,
				title: h2Node.title,
				categoryTitle: h1Node.title,
				content: h2Node.content,
				sourcePath: h2Node.sourcePath,
			};
			(rowEl as unknown as SidebarPreviewCarrierElement)[SIDEBAR_PREVIEW_ITEM_PROP] = previewItem;
		}
		rowEl.createDiv({ cls: "cna-guidebook-tree__row-toggle cna-guidebook-tree__row-toggle--placeholder" });

		const iconEl = rowEl.createSpan({ cls: "cna-guidebook-tree__row-icon" });
		setIcon(iconEl, UI.ICON.H2);

		const labelEl = rowEl.createSpan({
			cls: "cna-guidebook-tree__row-label",
			text: h2Node.title,
		});
		if (INACTIVE_STATUS_PATTERN.test(h2Node.content)) {
			rowEl.addClass("is-inactive-status");
			labelEl.addClass("is-inactive-status");
		}
		rowEl.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			event.stopPropagation();
			openGuidebookH2ContextMenu(
				event,
				this.options.menuLabels,
				fileNode,
				h1Node,
				h2Node,
				this.options.onH2ContextAction,
			);
		});
		this.bindDragAndDrop(rowEl, { kind: "h2", fileNode, h1Node, h2Node });
	}

	private renderCollapsibleRow(
		branchEl: HTMLElement,
		options: {
			label: string;
			icon: string;
			count: number;
			levelClass: string;
			onContextMenu?: (event: MouseEvent) => void;
		},
		stateKey: string,
	): { rowEl: HTMLElement; childrenEl: HTMLElement } {
		const rowEl = branchEl.createDiv({ cls: `cna-guidebook-tree__row ${options.levelClass}` });
		const toggleButtonEl = rowEl.createEl("button", {
			cls: "cna-guidebook-tree__row-toggle",
		});
		toggleButtonEl.type = "button";

		const toggleIconEl = toggleButtonEl.createSpan({ cls: "cna-guidebook-tree__row-toggle-icon" });
		const iconEl = rowEl.createSpan({ cls: "cna-guidebook-tree__row-icon" });
		setIcon(iconEl, options.icon);

		rowEl.createSpan({
			cls: "cna-guidebook-tree__row-label",
			text: options.label,
		});
		rowEl.createSpan({
			cls: "cna-guidebook-tree__row-count",
			text: `[${options.count}]`,
		});

		const childrenEl = branchEl.createDiv({ cls: "cna-guidebook-tree__children" });
		const applyExpanded = (expanded: boolean, persist: boolean): void => {
			this.nodeExpandedState.set(stateKey, expanded);
			branchEl.toggleClass("is-collapsed", !expanded);
			setIcon(toggleIconEl, expanded ? UI.ICON.CHEVRON_DOWN : UI.ICON.CHEVRON_RIGHT);
			if (persist) {
				this.emitExpandedStateChange();
			}
		};

		const toggle = (): void => {
			const currentExpanded = this.resolveExpanded(stateKey);
			applyExpanded(!currentExpanded, true);
		};
		toggleButtonEl.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			toggle();
		});
		rowEl.addEventListener("click", toggle);
		if (options.onContextMenu) {
			rowEl.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				event.stopPropagation();
				options.onContextMenu?.(event);
			});
		}
		applyExpanded(this.resolveExpanded(stateKey), false);

		return {
			rowEl,
			childrenEl,
		};
	}

	private bindDragAndDrop(rowEl: HTMLElement, targetPayload: DragTreeNodePayload): void {
		if (!this.options.onMove) {
			return;
		}
		rowEl.draggable = this.isDraggable(targetPayload);
		rowEl.addEventListener("dragstart", (event) => {
			if (!this.isDraggable(targetPayload) || this.handlingDrop) {
				event.preventDefault();
				return;
			}
			this.clearDragState();
			this.dragPayload = targetPayload;
			this.dragSourceRowEl = rowEl;
			rowEl.addClass("is-dragging");
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", "guidebook-drag");
			}
		});
		rowEl.addEventListener("dragover", (event) => {
			const dragPayload = this.dragPayload;
			if (!dragPayload || this.handlingDrop) {
				return;
			}
			const nextRequest = this.resolveMoveRequest(dragPayload, targetPayload, rowEl, event);
			if (!nextRequest) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "move";
			}
			this.applyDropIndicator(rowEl, nextRequest.position);
		});
		rowEl.addEventListener("drop", (event) => {
			const dragPayload = this.dragPayload;
			const onMove = this.options.onMove;
			if (!dragPayload || !onMove || this.handlingDrop) {
				return;
			}
			const moveRequest = this.resolveMoveRequest(dragPayload, targetPayload, rowEl, event);
			if (!moveRequest) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			this.handlingDrop = true;
			void (async () => {
				try {
					await onMove(moveRequest);
				} finally {
					this.handlingDrop = false;
					this.clearDragState();
				}
			})();
		});
		rowEl.addEventListener("dragend", () => {
			this.clearDragState();
		});
	}

	private isDraggable(payload: DragTreeNodePayload): boolean {
		if (payload.kind === "file") {
			return payload.fileNode.sourcePaths.length === 1;
		}
		return true;
	}

	private resolveMoveRequest(
		dragPayload: DragTreeNodePayload,
		targetPayload: DragTreeNodePayload,
		rowEl: HTMLElement,
		event: DragEvent | MouseEvent,
	): GuidebookTreeDragMoveRequest | null {
		if (dragPayload.kind === "file") {
			if (
				targetPayload.kind !== "file" ||
				dragPayload.fileNode === targetPayload.fileNode ||
				targetPayload.fileNode.sourcePaths.length !== 1
			) {
				return null;
			}
			return {
				kind: "file",
				sourceFileNode: dragPayload.fileNode,
				targetFileNode: targetPayload.fileNode,
				position: this.resolveBeforeAfter(rowEl, event),
			};
		}

		if (dragPayload.kind === "h1") {
			if (targetPayload.kind === "file") {
				if (targetPayload.fileNode.sourcePaths.length !== 1) {
					return null;
				}
				return {
					kind: "h1",
					sourceFileNode: dragPayload.fileNode,
					sourceH1Node: dragPayload.h1Node,
					targetFileNode: targetPayload.fileNode,
					position: "inside",
				};
			}
			if (targetPayload.kind === "h1") {
				if (dragPayload.h1Node === targetPayload.h1Node) {
					return null;
				}
				return {
					kind: "h1",
					sourceFileNode: dragPayload.fileNode,
					sourceH1Node: dragPayload.h1Node,
					targetFileNode: targetPayload.fileNode,
					targetH1Node: targetPayload.h1Node,
					position: this.resolveBeforeAfter(rowEl, event),
				};
			}
			return null;
		}

		if (targetPayload.kind === "h1") {
			return {
				kind: "h2",
				sourceFileNode: dragPayload.fileNode,
				sourceH1Node: dragPayload.h1Node,
				sourceH2Node: dragPayload.h2Node,
				targetFileNode: targetPayload.fileNode,
				targetH1Node: targetPayload.h1Node,
				position: "inside",
			};
		}
		if (targetPayload.kind === "h2") {
			if (dragPayload.h2Node === targetPayload.h2Node) {
				return null;
			}
			return {
				kind: "h2",
				sourceFileNode: dragPayload.fileNode,
				sourceH1Node: dragPayload.h1Node,
				sourceH2Node: dragPayload.h2Node,
				targetFileNode: targetPayload.fileNode,
				targetH1Node: targetPayload.h1Node,
				targetH2Node: targetPayload.h2Node,
				position: this.resolveBeforeAfter(rowEl, event),
			};
		}
		return null;
	}

	private resolveBeforeAfter(rowEl: HTMLElement, event: DragEvent | MouseEvent): "before" | "after" {
		const bounds = rowEl.getBoundingClientRect();
		const middleY = bounds.top + bounds.height / 2;
		return event.clientY < middleY ? "before" : "after";
	}

	private applyDropIndicator(rowEl: HTMLElement, indicator: DropIndicator): void {
		const nextClassName = `is-drop-${indicator}`;
		if (this.dropIndicatorRowEl === rowEl && this.dropIndicatorClassName === nextClassName) {
			return;
		}
		if (this.dropIndicatorRowEl && this.dropIndicatorClassName) {
			this.dropIndicatorRowEl.removeClass(this.dropIndicatorClassName);
		}
		rowEl.addClass(nextClassName);
		this.dropIndicatorRowEl = rowEl;
		this.dropIndicatorClassName = nextClassName;
	}

	private clearDragState(): void {
		this.dragPayload = null;
		if (this.dragSourceRowEl) {
			this.dragSourceRowEl.removeClass("is-dragging");
			this.dragSourceRowEl = null;
		}
		if (this.dropIndicatorRowEl && this.dropIndicatorClassName) {
			this.dropIndicatorRowEl.removeClass(this.dropIndicatorClassName);
		}
		this.dropIndicatorRowEl = null;
		this.dropIndicatorClassName = "";
	}

	private resolveExpanded(stateKey: string): boolean {
		const existing = this.nodeExpandedState.get(stateKey);
		if (typeof existing === "boolean") {
			return existing;
		}
		this.nodeExpandedState.set(stateKey, this.allExpanded);
		return this.allExpanded;
	}

	private emitExpandedStateChange(): void {
		this.options.onExpandedStateChange?.({
			allExpanded: this.allExpanded,
			nodeExpandedState: Object.fromEntries(this.nodeExpandedState),
		});
	}

	private pruneExpandedStateByScope(scopeKeyPrefix: string, knownScopeKeys: Set<string>): void {
		let pruned = false;
		for (const key of this.nodeExpandedState.keys()) {
			if (!key.startsWith(scopeKeyPrefix)) {
				continue;
			}
			if (!knownScopeKeys.has(key)) {
				this.nodeExpandedState.delete(key);
				pruned = true;
			}
		}
		if (pruned) {
			this.emitExpandedStateChange();
		}
	}

	private buildFileStateKey(libraryRootPath: string, fileNode: GuidebookTreeFileNode): string {
		const sourcePathsKey = [...fileNode.sourcePaths]
			.sort((left, right) => left.localeCompare(right))
			.join(STATE_KEY_PATH_SEPARATOR);
		return `${libraryRootPath}${STATE_KEY_SCOPE_SEPARATOR}file:${sourcePathsKey}`;
	}

	private buildH1StateKey(libraryRootPath: string, h1Node: GuidebookTreeH1Node): string {
		return `${libraryRootPath}${STATE_KEY_SCOPE_SEPARATOR}h1:${h1Node.sourcePath}${STATE_KEY_PATH_SEPARATOR}${h1Node.title.trim()}`;
	}
}


