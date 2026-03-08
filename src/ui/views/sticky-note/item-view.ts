import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../../constants";
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
		return IDS.view.stickyNoteSidebar;
	}

	getDisplayText(): string {
		return this.ctx.t("settings.tab.sticky_note");
	}

	getIcon(): string {
		return UI.icon.stickyNote;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const rootEl = contentEl.createDiv({ cls: "cna-right-sidebar" });
		this.activeTabDispose?.();
		this.activeTabDispose = renderStickyNoteSidebarPanel(rootEl, this.ctx) ?? null;
	}

	async onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
	}
}
