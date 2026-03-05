import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../constants";
import type { TranslationKey } from "../../lang";
import { TabsComponent, type TabDefinition } from "../componets/tabs";

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
		const tabs: TabDefinition[] = [
			{
				id: "setting",
				label: this.t("settings.tab.setting"),
				render: (panelEl) => {
					panelEl.createDiv({
						cls: "cna-right-sidebar-panel-placeholder",
						text: this.t("settings.tab.coming_soon"),
					});
				},
			},
			{
				id: "sticky_note",
				label: this.t("settings.tab.sticky_note"),
				render: (panelEl) => {
					panelEl.createDiv({
						cls: "cna-right-sidebar-panel-placeholder",
						text: this.t("settings.tab.coming_soon"),
					});
				},
			},
		];

		new TabsComponent({
			containerEl: rootEl,
			tabs,
			defaultTabId: "setting",
		});
	}

	async onClose(): Promise<void> {}
}
