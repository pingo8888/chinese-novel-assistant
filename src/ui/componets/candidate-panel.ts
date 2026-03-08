export interface CandidatePanelRenderContext<TItem> {
	item: TItem;
	index: number;
	isSelected: boolean;
	itemEl: HTMLButtonElement;
}

export interface CandidatePanelOptions<TItem> {
	containerEl?: HTMLElement;
	pageSize?: number;
	className?: string;
	emptyText?: string;
	getFooterText?: (ctx: CandidatePanelFooterContext) => string;
	getItemKey?: (item: TItem, index: number) => string;
	getItemLabel?: (item: TItem) => string;
	renderItem?: (ctx: CandidatePanelRenderContext<TItem>) => void;
	onSelect?: (item: TItem, index: number) => void;
	onHighlightChange?: (item: TItem | null, index: number) => void;
	onPageChange?: (page: number, totalPages: number) => void;
}

export interface CandidatePanelFooterContext {
	page: number;
	totalPages: number;
	totalItems: number;
	pageSize: number;
}

export interface CandidatePanelUpdate<TItem> {
	items: readonly TItem[];
	anchorRect?: DOMRect | null;
	page?: number;
	pageSize?: number;
	selectedIndex?: number;
	visible?: boolean;
	emptyText?: string;
	footerText?: string;
}

interface CandidatePanelState<TItem> {
	items: readonly TItem[];
	page: number;
	pageSize: number;
	selectedIndex: number;
	visible: boolean;
	emptyText: string;
	footerText: string;
	anchorRect: DOMRect | null;
}

export class CandidatePanelComponent<TItem> {
	private readonly rootEl: HTMLElement;
	private readonly listEl: HTMLElement;
	private readonly footerEl: HTMLElement;
	private readonly options: CandidatePanelOptions<TItem>;
	private state: CandidatePanelState<TItem>;

	constructor(options: CandidatePanelOptions<TItem> = {}) {
		this.options = options;
		this.rootEl = document.createElement("div");
		this.rootEl.addClass("cna-candidate-panel");
		if (options.className) {
			this.rootEl.addClass(options.className);
		}
		this.listEl = this.rootEl.createDiv({ cls: "cna-candidate-panel__list" });
		this.footerEl = this.rootEl.createDiv({ cls: "cna-candidate-panel__footer" });
		this.state = {
			items: [],
			page: 1,
			pageSize: Math.max(1, options.pageSize ?? 8),
			selectedIndex: 0,
			visible: false,
			emptyText: options.emptyText ?? "No candidates",
			footerText: "",
			anchorRect: null,
		};

		const host = options.containerEl ?? document.body;
		host.appendChild(this.rootEl);
		this.syncVisibility();
		this.render();
	}

	update(patch: CandidatePanelUpdate<TItem>): void {
		this.state = {
			...this.state,
			items: patch.items,
			anchorRect: patch.anchorRect ?? this.state.anchorRect,
			page: this.normalizePage(patch.page ?? this.state.page, patch.items, patch.pageSize ?? this.state.pageSize),
			pageSize: Math.max(1, patch.pageSize ?? this.state.pageSize),
			selectedIndex: Math.max(0, patch.selectedIndex ?? this.state.selectedIndex),
			visible: patch.visible ?? this.state.visible,
			emptyText: patch.emptyText ?? this.state.emptyText,
			footerText: patch.footerText ?? this.state.footerText,
		};
		this.ensureSelectedIndexInRange();
		this.syncVisibility();
		this.render();
		if (this.state.visible) {
			this.position();
		}
	}

	show(patch: Omit<CandidatePanelUpdate<TItem>, "visible">): void {
		this.update({ ...patch, visible: true });
	}

	hide(): void {
		if (!this.state.visible) {
			return;
		}
		this.state.visible = false;
		this.syncVisibility();
	}

	destroy(): void {
		this.rootEl.remove();
	}

	handleKeydown(evt: KeyboardEvent): boolean {
		if (!this.state.visible) {
			return false;
		}

		if (evt.key === "ArrowDown") {
			return this.moveSelection(1);
		}
		if (evt.key === "ArrowUp") {
			return this.moveSelection(-1);
		}
		if (evt.key === "ArrowRight") {
			return this.changePage(1);
		}
		if (evt.key === "ArrowLeft") {
			return this.changePage(-1);
		}
		if (evt.key === "Enter") {
			return this.selectCurrent();
		}
		if (evt.key === "Escape") {
			this.hide();
			return true;
		}
		return false;
	}

	moveSelection(offset: number): boolean {
		const pageItems = this.getCurrentPageItems();
		if (pageItems.length === 0) {
			return false;
		}

		const maxIndex = pageItems.length - 1;
		const nextIndex = this.wrapIndex(this.state.selectedIndex + offset, maxIndex);
		if (nextIndex === this.state.selectedIndex) {
			return false;
		}
		this.state.selectedIndex = nextIndex;
		this.render();
		this.emitHighlightChange();
		return true;
	}

	changePage(offset: number): boolean {
		const totalPages = this.getTotalPages(this.state.items, this.state.pageSize);
		if (totalPages <= 1) {
			return false;
		}
		const nextPage = this.clamp(this.state.page + offset, 1, totalPages);
		if (nextPage === this.state.page) {
			return false;
		}
		this.state.page = nextPage;
		this.state.selectedIndex = 0;
		this.render();
		this.position();
		this.options.onPageChange?.(this.state.page, totalPages);
		this.emitHighlightChange();
		return true;
	}

	selectCurrent(): boolean {
		const selected = this.getSelectedItem();
		if (!selected) {
			return false;
		}
		this.options.onSelect?.(selected.item, selected.index);
		return true;
	}

	isVisible(): boolean {
		return this.state.visible;
	}

	private syncVisibility(): void {
		this.rootEl.toggleClass("is-hidden", !this.state.visible);
	}

	private render(): void {
		this.listEl.empty();
		const pageItems = this.getCurrentPageItems();

		if (pageItems.length === 0) {
			this.listEl.createDiv({
				cls: "cna-candidate-panel__empty",
				text: this.state.emptyText,
			});
			this.footerEl.setText(this.resolveFooterText());
			return;
		}

		for (let index = 0; index < pageItems.length; index += 1) {
			const item = pageItems[index];
			if (item === undefined) {
				continue;
			}
			const itemEl = this.listEl.createEl("button", {
				cls: "cna-candidate-panel__item",
			});
			itemEl.type = "button";
			const key = this.options.getItemKey?.(item, index) ?? String(index);
			itemEl.dataset.cnaCandidateKey = key;
			itemEl.toggleClass("is-selected", index === this.state.selectedIndex);
			itemEl.addEventListener("mousedown", (evt) => {
				evt.preventDefault();
			});
			itemEl.addEventListener("mouseenter", () => {
				if (this.state.selectedIndex === index) {
					return;
				}
				this.state.selectedIndex = index;
				this.render();
				this.emitHighlightChange();
			});
			itemEl.addEventListener("click", () => {
				this.state.selectedIndex = index;
				this.selectCurrent();
			});

			if (this.options.renderItem) {
				this.options.renderItem({
					item,
					index,
					isSelected: index === this.state.selectedIndex,
					itemEl,
				});
				continue;
			}

			itemEl.setText(this.options.getItemLabel?.(item) ?? String(item));
		}

		this.footerEl.setText(this.resolveFooterText());
	}

	private position(): void {
		const anchorRect = this.state.anchorRect;
		if (!anchorRect) {
			return;
		}

		const gap = 6;
		const viewPadding = 8;
		const panelRect = this.rootEl.getBoundingClientRect();
		let left = anchorRect.left;
		let top = anchorRect.bottom + gap;

		if (left + panelRect.width > window.innerWidth - viewPadding) {
			left = Math.max(viewPadding, window.innerWidth - panelRect.width - viewPadding);
		}
		if (top + panelRect.height > window.innerHeight - viewPadding) {
			top = Math.max(viewPadding, anchorRect.top - panelRect.height - gap);
		}

		this.rootEl.setCssProps({
			left: `${Math.round(left)}px`,
			top: `${Math.round(top)}px`,
		});
	}

	private getCurrentPageItems(): readonly TItem[] {
		if (this.state.items.length === 0) {
			return [];
		}
		const start = (this.state.page - 1) * this.state.pageSize;
		return this.state.items.slice(start, start + this.state.pageSize);
	}

	private getSelectedItem(): { item: TItem; index: number } | null {
		const pageItems = this.getCurrentPageItems();
		if (pageItems.length === 0) {
			return null;
		}
		const selectedIndex = this.clamp(this.state.selectedIndex, 0, pageItems.length - 1);
		const item = pageItems[selectedIndex];
		if (!item) {
			return null;
		}
		const absoluteIndex = (this.state.page - 1) * this.state.pageSize + selectedIndex;
		return {
			item,
			index: absoluteIndex,
		};
	}

	private emitHighlightChange(): void {
		const selected = this.getSelectedItem();
		this.options.onHighlightChange?.(selected?.item ?? null, selected?.index ?? -1);
	}

	private ensureSelectedIndexInRange(): void {
		const currentPageItems = this.getCurrentPageItems();
		if (currentPageItems.length === 0) {
			this.state.selectedIndex = 0;
			return;
		}
		this.state.selectedIndex = this.clamp(this.state.selectedIndex, 0, currentPageItems.length - 1);
	}

	private buildDefaultFooterText(): string {
		const totalPages = this.getTotalPages(this.state.items, this.state.pageSize);
		return `Page ${this.state.page}/${totalPages}  (<-/-> page, Up/Down select, Enter confirm)`;
	}

	private resolveFooterText(): string {
		if (this.state.footerText) {
			return this.state.footerText;
		}
		const totalPages = this.getTotalPages(this.state.items, this.state.pageSize);
		if (this.options.getFooterText) {
			return this.options.getFooterText({
				page: this.state.page,
				totalPages,
				totalItems: this.state.items.length,
				pageSize: this.state.pageSize,
			});
		}
		return this.buildDefaultFooterText();
	}

	private getTotalPages(items: readonly TItem[], pageSize: number): number {
		if (items.length === 0) {
			return 1;
		}
		return Math.max(1, Math.ceil(items.length / Math.max(1, pageSize)));
	}

	private normalizePage(nextPage: number, items: readonly TItem[], pageSize: number): number {
		const totalPages = this.getTotalPages(items, pageSize);
		return this.clamp(nextPage, 1, totalPages);
	}

	private wrapIndex(value: number, maxIndex: number): number {
		if (maxIndex <= 0) {
			return 0;
		}
		if (value < 0) {
			return maxIndex;
		}
		if (value > maxIndex) {
			return 0;
		}
		return value;
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}
}
