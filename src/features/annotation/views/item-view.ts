import { ItemView, WorkspaceLeaf } from "obsidian";
import { UI, type PluginContext } from "../../../core";
import { renderAnnotationSidebarPanel } from "./sidebar-panel";

export class AnnotationSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ctx: PluginContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return "annotation-sidebar";
	}

	getDisplayText(): string {
		return this.ctx.t("settings.tab.annotation");
	}

	getIcon(): string {
		return UI.ICON.BOOKMARK;
	}

	onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const rootEl = contentEl.createDiv({ cls: "cna-right-sidebar" });
		this.activeTabDispose?.();
		this.activeTabDispose = renderAnnotationSidebarPanel(rootEl, this.ctx) ?? null;
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
		return Promise.resolve();
	}
}
