import { ItemView, WorkspaceLeaf } from "obsidian";
import { IDS, UI } from "../../constants";

export class ChineseNovelAssistantRightSidebarView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly getTooltipText: () => string,
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
		contentEl.createDiv({
			text: this.getTooltipText(),
		});
	}

	async onClose(): Promise<void> {}
}
