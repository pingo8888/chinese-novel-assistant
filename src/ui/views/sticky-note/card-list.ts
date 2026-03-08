import { Notice, type App } from "obsidian";
import type { TranslationKey } from "../../../lang";
import { renderStickyNoteCardItem } from "./card-item";
import type { StickyNoteCardModel, StickyNoteSortMode, StickyNoteViewOptions } from "./types";
import { closeStickyNoteCardMenu } from "./card-menu";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import { StickyNoteRepository } from "../../../features/sticky-note/repository";

export interface StickyNoteCardListController {
	setSortMode(sortMode: StickyNoteSortMode): void;
	setSearchKeyword(keyword: string): void;
	setViewOptions(nextOptions: StickyNoteViewOptions): void;
	rerender(): void;
	refresh(): void;
	applyVaultFileCreateOrModify(path: string): void;
	applyVaultFileDelete(path: string): void;
	applyVaultFileRename(oldPath: string, newPath: string): void;
	destroy(): void;
}

interface StickyNoteCardListDeps {
	app: App;
	containerEl: HTMLElement;
	t: (key: TranslationKey) => string;
	getSettings: () => ChineseNovelAssistantSettings;
	getStickyNoteRootPaths: () => string[];
	onVisibleCountChange?: (count: number) => void;
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
		cards: [],
	};
	const repository = new StickyNoteRepository(deps.app);

	let isDestroyed = false;
	let loadVersion = 0;
	let cardItemDisposers: Array<() => void> = [];
	const fileReadVersionByPath = new Map<string, number>();
	const imageExpandedByPath = new Map<string, boolean>();

	const rememberImageExpandedState = (card: StickyNoteCardModel): void => {
		imageExpandedByPath.set(card.sourcePath, card.isImageExpanded);
	};

	const replaceCards = (nextCards: StickyNoteCardModel[]): void => {
		for (const card of state.cards) {
			rememberImageExpandedState(card);
			revokeImageUrls(card.images);
		}
		state.cards = nextCards;
	};

	const preserveImageExpandedState = (nextCards: StickyNoteCardModel[]): StickyNoteCardModel[] => {
		if (nextCards.length === 0) {
			return nextCards;
		}
		for (const card of nextCards) {
			const preserved = imageExpandedByPath.get(card.sourcePath);
			if (typeof preserved === "boolean") {
				card.isImageExpanded = preserved;
			}
		}
		return nextCards;
	};

	const loadCardsFromVault = async (): Promise<void> => {
		const currentLoadVersion = ++loadVersion;
		try {
			const cards = await repository.listCards(deps.getSettings(), {
				imageAutoExpand: state.viewOptions.imageAutoExpand,
				rootPaths: deps.getStickyNoteRootPaths(),
			});
			if (isDestroyed || currentLoadVersion !== loadVersion) {
				for (const card of cards) {
					revokeImageUrls(card.images);
				}
				return;
			}
			replaceCards(preserveImageExpandedState(cards));
			render();
		} catch (error) {
			if (isDestroyed) {
				return;
			}
			console.error("[Chinese Novel Assistant] Failed to load sticky notes.", error);
			new Notice("便签加载失败，请检查控制台日志。");
		}
	};

	const removeCardByPath = (path: string, shouldRender: boolean): boolean => {
		const index = state.cards.findIndex((item) => item.sourcePath === path);
		if (index < 0) {
			imageExpandedByPath.delete(path);
			return false;
		}
		const [removed] = state.cards.splice(index, 1);
		if (removed) {
			imageExpandedByPath.delete(path);
			revokeImageUrls(removed.images);
		}
		if (shouldRender) {
			render();
		}
		return true;
	};

	const upsertCard = (nextCard: StickyNoteCardModel): void => {
		const index = state.cards.findIndex((item) => item.sourcePath === nextCard.sourcePath);
		const preservedExpanded = imageExpandedByPath.get(nextCard.sourcePath);
		if (typeof preservedExpanded === "boolean") {
			nextCard.isImageExpanded = preservedExpanded;
		}
		if (index < 0) {
			state.cards.push(nextCard);
			render();
			return;
		}
		const previous = state.cards[index];
		if (!previous) {
			state.cards.push(nextCard);
			render();
			return;
		}
		state.cards[index] = nextCard;
		rememberImageExpandedState(nextCard);
		revokeImageUrls(previous.images);
		render();
	};

	const loadCardByPathFromVault = async (path: string): Promise<void> => {
		const pathReadVersion = (fileReadVersionByPath.get(path) ?? 0) + 1;
		fileReadVersionByPath.set(path, pathReadVersion);
		try {
			const nextCard = await repository.getCardByPath(path, {
				imageAutoExpand: state.viewOptions.imageAutoExpand,
			});
			if (isDestroyed) {
				if (nextCard) {
					revokeImageUrls(nextCard.images);
				}
				return;
			}
			if (fileReadVersionByPath.get(path) !== pathReadVersion) {
				if (nextCard) {
					revokeImageUrls(nextCard.images);
				}
				return;
			}
			fileReadVersionByPath.delete(path);
			if (!nextCard) {
				removeCardByPath(path, true);
				return;
			}
			upsertCard(nextCard);
		} catch (error) {
			fileReadVersionByPath.delete(path);
			if (!isDestroyed) {
				console.error("[Chinese Novel Assistant] Failed to load sticky note file.", error);
			}
		}
	};

	const persistCard = async (card: StickyNoteCardModel): Promise<void> => {
		try {
			await repository.saveCard(card);
		} catch (error) {
			if (isDestroyed) {
				return;
			}
			console.error("[Chinese Novel Assistant] Failed to save sticky note.", error);
			new Notice("便签保存失败，请检查控制台日志。");
		}
	};

	const deleteCardFromVault = async (card: StickyNoteCardModel): Promise<boolean> => {
		try {
			await repository.deleteCard(card);
			return true;
		} catch (error) {
			if (!isDestroyed) {
				console.error("[Chinese Novel Assistant] Failed to delete sticky note.", error);
				new Notice("便签删除失败，请检查控制台日志。");
			}
			return false;
		}
	};

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
		deps.onVisibleCountChange?.(visibleCards.length);
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
					void persistCard(card);
					render();
				},
				onImageExpandedChange: (isExpanded) => {
					imageExpandedByPath.set(card.sourcePath, isExpanded);
				},
				onCardDelete: () => {
					void (async () => {
						const deleted = await deleteCardFromVault(card);
						if (!deleted || isDestroyed) {
							return;
						}
						removeCardByPath(card.sourcePath, true);
					})();
				},
			});
			cardItemDisposers.push(disposeCardItem);
		}
	};

	render();
	void loadCardsFromVault();

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
				imageExpandedByPath.clear();
				for (const card of state.cards) {
					card.isImageExpanded = nextOptions.imageAutoExpand;
					imageExpandedByPath.set(card.sourcePath, nextOptions.imageAutoExpand);
				}
			}
			render();
		},
		refresh() {
			void loadCardsFromVault();
		},
		rerender() {
			render();
		},
		applyVaultFileCreateOrModify(path) {
			if (!path) {
				return;
			}
			void loadCardByPathFromVault(path);
		},
		applyVaultFileDelete(path) {
			if (!path) {
				return;
			}
			fileReadVersionByPath.delete(path);
			removeCardByPath(path, true);
		},
		applyVaultFileRename(oldPath, newPath) {
			if (oldPath && oldPath !== newPath) {
				fileReadVersionByPath.delete(oldPath);
				removeCardByPath(oldPath, false);
			}
			if (newPath) {
				void loadCardByPathFromVault(newPath);
				return;
			}
			render();
		},
		destroy() {
			if (isDestroyed) {
				return;
			}
			isDestroyed = true;
			loadVersion += 1;
			fileReadVersionByPath.clear();
			imageExpandedByPath.clear();
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
	const nonFloatingCards = state.cards.filter((card) => !card.isFloating);
	const matched = keyword.length === 0
		? nonFloatingCards
		: nonFloatingCards.filter((card) => isCardMatched(card, keyword));
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
