import { ItemView, WorkspaceLeaf } from "obsidian";
import { UI, type PluginContext } from "../../../core";
import { renderTimelineSidebarPanel } from "./sidebar-panel";

export class TimelineSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ctx: PluginContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return "timeline-sidebar";
	}

	getDisplayText(): string {
		return this.ctx.t("feature.timeline.title");
	}

	getIcon(): string {
		return UI.ICON.TIME_LINE;
	}

	onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		const rootEl = contentEl.createDiv({ cls: "cna-right-sidebar" });
		this.activeTabDispose?.();
		this.activeTabDispose = renderTimelineSidebarPanel(rootEl, this.ctx) ?? null;
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
		return Promise.resolve();
	}
}
