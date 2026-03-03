export interface TabDefinition {
	id: string;
	label: string;
	render: (containerEl: HTMLElement) => void;
}

export interface TabsComponentOptions {
	containerEl: HTMLElement;
	tabs: TabDefinition[];
	defaultTabId?: string;
	onTabChange?: (tabId: string) => void;
}

export class TabsComponent {
	private readonly rootEl: HTMLElement;
	private readonly tabListEl: HTMLElement;
	private readonly panelEl: HTMLElement;
	private readonly tabs: TabDefinition[];
	private readonly buttonByTabId: Map<string, HTMLButtonElement>;
	private readonly onTabChange?: (tabId: string) => void;
	private activeTabId: string;

	constructor(options: TabsComponentOptions) {
		if (options.tabs.length === 0) {
			throw new Error("TabsComponent requires at least one tab.");
		}

		this.tabs = options.tabs;
		this.onTabChange = options.onTabChange;
		this.rootEl = options.containerEl.createDiv({ cls: "cna-tabs" });
		this.tabListEl = this.rootEl.createDiv({ cls: "cna-tab-list" });
		this.panelEl = this.rootEl.createDiv({ cls: "cna-tab-panel" });
		this.buttonByTabId = new Map<string, HTMLButtonElement>();
		this.activeTabId = this.resolveDefaultTabId(options.defaultTabId);

		this.renderTabButtons();
		this.selectTab(this.activeTabId);
	}

	selectTab(tabId: string): void {
		const tab = this.tabs.find((item) => item.id === tabId);
		if (!tab) {
			return;
		}

		this.activeTabId = tab.id;
		this.syncButtonState();
		this.panelEl.empty();
		tab.render(this.panelEl);
		this.onTabChange?.(tab.id);
	}

	getActiveTabId(): string {
		return this.activeTabId;
	}

	private resolveDefaultTabId(defaultTabId?: string): string {
		const firstTab = this.tabs[0];
		if (!firstTab) {
			throw new Error("TabsComponent requires at least one tab.");
		}

		if (!defaultTabId) {
			return firstTab.id;
		}

		const exists = this.tabs.some((tab) => tab.id === defaultTabId);
		return exists ? defaultTabId : firstTab.id;
	}

	private renderTabButtons(): void {
		for (const tab of this.tabs) {
			const button = this.tabListEl.createEl("button", {
				text: tab.label,
				cls: "cna-tab-button",
			});
			button.type = "button";
			button.addEventListener("click", () => {
				this.selectTab(tab.id);
			});
			this.buttonByTabId.set(tab.id, button);
		}
	}

	private syncButtonState(): void {
		for (const [tabId, button] of this.buttonByTabId.entries()) {
			button.toggleClass("is-active", tabId === this.activeTabId);
			button.setAttr("aria-selected", tabId === this.activeTabId ? "true" : "false");
		}
	}
}
