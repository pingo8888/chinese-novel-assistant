import { setIcon } from "obsidian";
import { UI } from "../../../constants";
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

interface GuidebookTreeViewOptions {
	menuLabels: GuidebookContextMenuLabels;
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
	private allExpanded = true;
	private lastData: GuidebookTreeData | null = null;
	private lastEmptyText = "";

	constructor(containerEl: HTMLElement, options: GuidebookTreeViewOptions) {
		this.viewportEl = containerEl;
		this.rootEl = containerEl.createDiv({ cls: "cna-guidebook-tree" });
		this.options = options;
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
		if (this.lastData) {
			this.renderData(this.lastData, this.lastEmptyText);
		}
	}

	renderLoading(text: string): void {
		this.rootEl.empty();
		this.rootEl.createDiv({
			cls: "cna-guidebook-tree__empty",
			text,
		});
	}

	renderData(data: GuidebookTreeData | null, emptyText: string): void {
		this.lastData = data;
		this.lastEmptyText = emptyText;
		this.rootEl.empty();

		if (!data || data.files.length === 0) {
			this.rootEl.createDiv({
				cls: "cna-guidebook-tree__empty",
				text: emptyText,
			});
			return;
		}

		data.files.forEach((fileNode) => {
			const fileKey = `file:${fileNode.stableKey}`;
			const fileBranchEl = this.rootEl.createDiv({ cls: "cna-guidebook-tree__branch cna-guidebook-tree__branch--file" });
			const fileChildrenEl = this.renderCollapsibleRow(
				fileBranchEl,
				{
					label: fileNode.fileName,
					icon: UI.icon.file,
					count: fileNode.h2Count,
					levelClass: "cna-guidebook-tree__row--file",
					onContextMenu: (event) => {
						openGuidebookFileContextMenu(event, this.options.menuLabels, fileNode, this.options.onFileContextAction);
					},
				},
				fileKey,
			);

			fileNode.h1List.forEach((h1Node) => {
				this.renderH1Node(fileChildrenEl, fileNode, h1Node);
			});
		});
	}

	destroy(): void {
		this.viewportEl.removeEventListener("contextmenu", this.onViewportContextMenu);
		this.rootEl.empty();
		this.nodeExpandedState.clear();
	}

	private renderH1Node(
		containerEl: HTMLElement,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
	): void {
		const h1Key = `h1:${h1Node.sourceFileCtime}:${h1Node.h1IndexInSource}`;
		const h1BranchEl = containerEl.createDiv({ cls: "cna-guidebook-tree__branch cna-guidebook-tree__branch--h1" });
		const h1ChildrenEl = this.renderCollapsibleRow(
			h1BranchEl,
			{
				label: h1Node.title,
				icon: UI.icon.h1,
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
		rowEl.createDiv({ cls: "cna-guidebook-tree__row-toggle cna-guidebook-tree__row-toggle--placeholder" });

		const iconEl = rowEl.createSpan({ cls: "cna-guidebook-tree__row-icon" });
		setIcon(iconEl, UI.icon.h2);

		rowEl.createSpan({
			cls: "cna-guidebook-tree__row-label",
			text: h2Node.title,
		});
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
	): HTMLElement {
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
		const applyExpanded = (expanded: boolean): void => {
			this.nodeExpandedState.set(stateKey, expanded);
			branchEl.toggleClass("is-collapsed", !expanded);
			setIcon(toggleIconEl, expanded ? UI.icon.chevronDown : UI.icon.chevronRight);
		};

		const toggle = (): void => {
			const currentExpanded = this.resolveExpanded(stateKey);
			applyExpanded(!currentExpanded);
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
		applyExpanded(this.resolveExpanded(stateKey));

		return childrenEl;
	}

	private resolveExpanded(stateKey: string): boolean {
		const existing = this.nodeExpandedState.get(stateKey);
		if (typeof existing === "boolean") {
			return existing;
		}
		this.nodeExpandedState.set(stateKey, this.allExpanded);
		return this.allExpanded;
	}
}
