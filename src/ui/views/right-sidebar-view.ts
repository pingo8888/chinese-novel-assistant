import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../constants";
import {
	renderRightSidebarGuidebookView,
	renderRightSidebarStickyNoteView,
	type RightSidebarViewRenderContext,
} from "./right-sidebar-views";

export class ChineseNovelAssistantGuidebookSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly getTooltipText: () => string,
		private readonly ctx: RightSidebarViewRenderContext,
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

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const rootEl = contentEl.createDiv({ cls: "cna-right-sidebar" });
		this.activeTabDispose?.();
		this.activeTabDispose = renderRightSidebarGuidebookView(rootEl, this.ctx) ?? null;
	}

	async onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
	}
}

export class ChineseNovelAssistantStickyNoteSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ctx: RightSidebarViewRenderContext,
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
		this.activeTabDispose = renderRightSidebarStickyNoteView(rootEl, this.ctx) ?? null;
	}

	async onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
	}
}
