import { ItemView, WorkspaceLeaf } from "obsidian";
import { UI } from "../../../core/constants";
import type { SidebarViewRenderContext } from "../sidebar/types";
import { renderStickyNoteSidebarPanel } from "./sidebar-panel";

export class StickyNoteSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ctx: SidebarViewRenderContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return "sticky-note-sidebar";
	}

	getDisplayText(): string {
		return this.ctx.t("settings.tab.sticky_note");
	}

	getIcon(): string {
		return UI.ICON.STICKY_NOTE;
	}

	onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const rootEl = contentEl.createDiv({ cls: "cna-right-sidebar" });
		this.activeTabDispose?.();
		this.activeTabDispose = renderStickyNoteSidebarPanel(rootEl, this.ctx) ?? null;
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
		return Promise.resolve();
	}
}


