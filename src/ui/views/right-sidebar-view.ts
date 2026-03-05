import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../constants";
import { TabsComponent, type TabDefinition } from "../componets/tabs";
import {
	renderRightSidebarGuidebookView,
	renderRightSidebarStickyNoteView,
	type RightSidebarViewRenderContext,
} from "./right-sidebar-views";

export class ChineseNovelAssistantRightSidebarView extends ItemView {
	private activeTabDispose: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly getTooltipText: () => string,
		private readonly ctx: RightSidebarViewRenderContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return IDS.view.rightSidebar;
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
		const tabs: TabDefinition[] = [
			{
				id: "guidebook",
				label: this.ctx.t("settings.tab.guidebook"),
				render: (panelEl) => {
					this.activeTabDispose?.();
					this.activeTabDispose = renderRightSidebarGuidebookView(panelEl, this.ctx);
				},
			},
			{
				id: "sticky_note",
				label: this.ctx.t("settings.tab.sticky_note"),
				render: (panelEl) => {
					this.activeTabDispose?.();
					this.activeTabDispose = renderRightSidebarStickyNoteView(panelEl, this.ctx) ?? null;
				},
			},
		];

		new TabsComponent({
			containerEl: rootEl,
			tabs,
			defaultTabId: "guidebook",
		});
	}

	async onClose(): Promise<void> {
		this.activeTabDispose?.();
		this.activeTabDispose = null;
	}
}
