import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../constants";
import type { TranslationKey } from "../../lang";
import { TabsComponent, type TabDefinition } from "../componets/tabs";
import {
	renderRightSidebarGuidebookView,
	renderRightSidebarStickyNoteView,
	type RightSidebarViewRenderContext,
} from "./right-sidebar-views";

export class ChineseNovelAssistantRightSidebarView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly getTooltipText: () => string,
		private readonly t: (key: TranslationKey) => string,
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
		const renderContext: RightSidebarViewRenderContext = {
			t: (key) => this.t(key),
		};
		const tabs: TabDefinition[] = [
			{
				id: "guidebook",
				label: this.t("settings.tab.guidebook"),
				render: (panelEl) => {
					renderRightSidebarGuidebookView(panelEl, renderContext);
				},
			},
			{
				id: "sticky_note",
				label: this.t("settings.tab.sticky_note"),
				render: (panelEl) => {
					renderRightSidebarStickyNoteView(panelEl, renderContext);
				},
			},
		];

		new TabsComponent({
			containerEl: rootEl,
			tabs,
			defaultTabId: "guidebook",
		});
	}

	async onClose(): Promise<void> {}
}
