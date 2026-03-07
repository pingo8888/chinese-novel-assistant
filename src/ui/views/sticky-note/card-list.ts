import type { App } from "obsidian";
import type { TranslationKey } from "../../../lang";
import { renderStickyNoteCardItem } from "./card-item";
import type { StickyNoteCardModel, StickyNoteSortMode, StickyNoteViewOptions } from "./types";
import { closeStickyNoteCardMenu } from "./card-menu";

export interface StickyNoteCardListController {
	setSortMode(sortMode: StickyNoteSortMode): void;
	setSearchKeyword(keyword: string): void;
	setViewOptions(nextOptions: StickyNoteViewOptions): void;
	refresh(): void;
	destroy(): void;
}

interface StickyNoteCardListDeps {
	app: App;
	containerEl: HTMLElement;
	t: (key: TranslationKey) => string;
	initialSortMode: StickyNoteSortMode;
	initialSearchKeyword?: string;
	initialViewOptions: StickyNoteViewOptions;
}

interface StickyNoteCardListState {
	sortMode: StickyNoteSortMode;
	searchKeyword: string;
	viewOptions: StickyNoteViewOptions;
	cards: StickyNoteCardModel[];
}

export function createStickyNoteCardList(deps: StickyNoteCardListDeps): StickyNoteCardListController {
	const state: StickyNoteCardListState = {
		sortMode: deps.initialSortMode,
		searchKeyword: deps.initialSearchKeyword ?? "",
		viewOptions: deps.initialViewOptions,
		cards: createMockStickyNoteCards(deps.initialViewOptions.imageAutoExpand),
	};

	let isDestroyed = false;
	let cardItemDisposers: Array<() => void> = [];

	const render = (): void => {
		if (isDestroyed) {
			return;
		}
		for (const dispose of cardItemDisposers) {
			dispose();
		}
		cardItemDisposers = [];
		closeStickyNoteCardMenu();
		deps.containerEl.empty();
		const listEl = deps.containerEl.createDiv({ cls: "cna-sticky-note-card-list" });
		const visibleCards = getVisibleCards(state);
		if (visibleCards.length === 0) {
			listEl.createDiv({
				cls: "cna-sticky-note-card-list__empty",
				text: deps.t("feature.right_sidebar.sticky_note.list.empty"),
			});
			return;
		}

		for (const card of visibleCards) {
			const disposeCardItem = renderStickyNoteCardItem({
				app: deps.app,
				containerEl: listEl,
				card,
				sortMode: state.sortMode,
				viewOptions: state.viewOptions,
				t: deps.t,
				onCardTouched: () => {
					render();
				},
				onCardDelete: () => {
					const removed = state.cards.find((item) => item.id === card.id);
					if (removed) {
						revokeImageUrls(removed.images);
					}
					state.cards = state.cards.filter((item) => item.id !== card.id);
					render();
				},
			});
			cardItemDisposers.push(disposeCardItem);
		}
	};

	render();

	return {
		setSortMode(sortMode) {
			if (state.sortMode === sortMode) {
				return;
			}
			state.sortMode = sortMode;
			render();
		},
		setSearchKeyword(keyword) {
			if (state.searchKeyword === keyword) {
				return;
			}
			state.searchKeyword = keyword;
			render();
		},
		setViewOptions(nextOptions) {
			const previous = state.viewOptions;
			state.viewOptions = nextOptions;
			if (previous.imageAutoExpand !== nextOptions.imageAutoExpand) {
				for (const card of state.cards) {
					card.isImageExpanded = nextOptions.imageAutoExpand;
				}
			}
			render();
		},
		refresh() {
			render();
		},
		destroy() {
			if (isDestroyed) {
				return;
			}
			isDestroyed = true;
			for (const dispose of cardItemDisposers) {
				dispose();
			}
			cardItemDisposers = [];
			for (const card of state.cards) {
				revokeImageUrls(card.images);
			}
			deps.containerEl.empty();
		},
	};
}

function getVisibleCards(state: StickyNoteCardListState): StickyNoteCardModel[] {
	const keyword = state.searchKeyword.trim().toLowerCase();
	const matched = keyword.length === 0
		? state.cards
		: state.cards.filter((card) => isCardMatched(card, keyword));
	return [...matched].sort((left, right) => compareCards(left, right, state.sortMode));
}

function compareCards(left: StickyNoteCardModel, right: StickyNoteCardModel, sortMode: StickyNoteSortMode): number {
	if (left.isPinned !== right.isPinned) {
		return left.isPinned ? -1 : 1;
	}
	switch (sortMode) {
		case "created_desc":
			return right.createdAt - left.createdAt;
		case "created_asc":
			return left.createdAt - right.createdAt;
		case "modified_desc":
			return right.updatedAt - left.updatedAt;
		case "modified_asc":
			return left.updatedAt - right.updatedAt;
		default:
			return right.createdAt - left.createdAt;
	}
}

function isCardMatched(card: StickyNoteCardModel, normalizedKeyword: string): boolean {
	const searchSpace = `${card.contentPlainText}\n${card.tagsText}`.toLowerCase();
	return searchSpace.includes(normalizedKeyword);
}

function revokeImageUrls(images: StickyNoteCardModel["images"]): void {
	for (const image of images) {
		if (image.revokeOnDestroy) {
			URL.revokeObjectURL(image.src);
		}
	}
}

function createMockStickyNoteCards(imageAutoExpand: boolean): StickyNoteCardModel[] {
	const now = Date.now();
	return [
		{
			id: "note-1",
			createdAt: now - 1000 * 60 * 60 * 24 * 5,
			updatedAt: now - 1000 * 60 * 35,
			contentMarkdown: "**剧情钩子**\n- 主角在旧档案里看到一张合照。\n- 合照里出现了已经死亡的人物。",
			contentPlainText: "剧情钩子 主角在旧档案里看到一张合照。 合照里出现了已经死亡的人物。",
			tagsText: "#角色 #伏笔",
			images: [],
			isImageExpanded: imageAutoExpand,
			isPinned: false,
		},
		{
			id: "note-2",
			createdAt: now - 1000 * 60 * 60 * 24 * 2,
			updatedAt: now - 1000 * 60 * 60 * 3,
			contentMarkdown: "开篇第一章的天气描写要再压抑一点。\n1. 降低能见度\n2. 增加潮湿感",
			contentPlainText: "开篇第一章的天气描写要再压抑一点。 降低能见度 增加潮湿感",
			tagsText: "",
			images: [],
			isImageExpanded: imageAutoExpand,
			isPinned: false,
		},
		{
			id: "note-3",
			createdAt: now - 1000 * 60 * 60 * 24,
			updatedAt: now - 1000 * 60 * 15,
			contentMarkdown: "**反转点：**第三幕由配角揭示真正动机。",
			contentPlainText: "反转点：第三幕由配角揭示真正动机。",
			tagsText: "#剧情 #反转",
			images: [],
			isImageExpanded: imageAutoExpand,
			isPinned: false,
		},
	];
}
