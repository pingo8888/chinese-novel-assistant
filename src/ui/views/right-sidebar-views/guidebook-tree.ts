import { setIcon } from "obsidian";
import { UI } from "../../../constants";
import type {
	GuidebookTreeData,
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
	GuidebookTreeH2Node,
} from "../../../features/right-sidebar/guidebook-tree-builder";

export interface GuidebookTreeViewComponent {
	setAllExpanded(expanded: boolean): void;
	renderLoading(text: string): void;
	renderData(data: GuidebookTreeData | null, emptyText: string): void;
	destroy(): void;
}

export function createGuidebookTreeViewComponent(containerEl: HTMLElement): GuidebookTreeViewComponent {
	return new GuidebookTreeView(containerEl);
}

class GuidebookTreeView implements GuidebookTreeViewComponent {
	private readonly rootEl: HTMLElement;
	private readonly nodeExpandedState = new Map<string, boolean>();
	private allExpanded = true;
	private lastData: GuidebookTreeData | null = null;
	private lastEmptyText = "";

	constructor(containerEl: HTMLElement) {
		this.rootEl = containerEl.createDiv({ cls: "cna-guidebook-tree" });
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

		data.files.forEach((fileNode, fileIndex) => {
			const fileKey = `file:${fileNode.fileName}:${fileIndex}`;
			const fileBranchEl = this.rootEl.createDiv({ cls: "cna-guidebook-tree__branch cna-guidebook-tree__branch--file" });
			const fileChildrenEl = this.renderCollapsibleRow(
				fileBranchEl,
				{
					label: fileNode.fileName,
					icon: UI.icon.file,
					count: fileNode.h2Count,
					levelClass: "cna-guidebook-tree__row--file",
				},
				fileKey,
			);

			fileNode.h1List.forEach((h1Node, h1Index) => {
				this.renderH1Node(fileChildrenEl, fileNode, h1Node, fileIndex, h1Index);
			});
		});
	}

	destroy(): void {
		this.rootEl.empty();
		this.nodeExpandedState.clear();
	}

	private renderH1Node(
		containerEl: HTMLElement,
		fileNode: GuidebookTreeFileNode,
		h1Node: GuidebookTreeH1Node,
		fileIndex: number,
		h1Index: number,
	): void {
		const h1Key = `h1:${fileNode.fileName}:${fileIndex}:${h1Node.title}:${h1Index}`;
		const h1BranchEl = containerEl.createDiv({ cls: "cna-guidebook-tree__branch cna-guidebook-tree__branch--h1" });
		const h1ChildrenEl = this.renderCollapsibleRow(
			h1BranchEl,
			{
				label: h1Node.title,
				icon: UI.icon.h1,
				count: h1Node.h2List.length,
				levelClass: "cna-guidebook-tree__row--h1",
			},
			h1Key,
		);

		h1Node.h2List.forEach((h2Node) => {
			this.renderH2Node(h1ChildrenEl, h2Node);
		});
	}

	private renderH2Node(containerEl: HTMLElement, h2Node: GuidebookTreeH2Node): void {
		const rowEl = containerEl.createDiv({ cls: "cna-guidebook-tree__row cna-guidebook-tree__row--h2" });
		rowEl.createDiv({ cls: "cna-guidebook-tree__row-toggle cna-guidebook-tree__row-toggle--placeholder" });

		const iconEl = rowEl.createSpan({ cls: "cna-guidebook-tree__row-icon" });
		setIcon(iconEl, UI.icon.h2);

		rowEl.createSpan({
			cls: "cna-guidebook-tree__row-label",
			text: h2Node.title,
		});
	}

	private renderCollapsibleRow(
		branchEl: HTMLElement,
		options: {
			label: string;
			icon: string;
			count: number;
			levelClass: string;
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
