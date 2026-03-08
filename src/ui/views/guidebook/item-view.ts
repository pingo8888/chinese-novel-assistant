import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../../constants";
import type { SidebarViewRenderContext } from "../sidebar/types";
import { renderGuidebookSidebarPanel } from "./sidebar-panel";

export class GuidebookSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly getTooltipText: () => string,
		private readonly ctx: SidebarViewRenderContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return IDS.view.guidebookSidebar;
	}

	getDisplayText(): string {
		return this.getTooltipText();
	}

	getIcon(): string {
		return UI.icon.plugin;
	}

	onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const rootEl = contentEl.createDiv({ cls: "cna-right-sidebar" });
		this.activeTabDispose?.();
		this.activeTabDispose = renderGuidebookSidebarPanel(rootEl, this.ctx) ?? null;
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
		return Promise.resolve();
	}
}
