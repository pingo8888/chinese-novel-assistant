import { Notice, type App } from "obsidian";
import type { TranslationKey } from "../../../lang";
import { closeTimelineCardMenu } from "./card-menu";
import { renderTimelineCardItem } from "./card-item";
import type { TimelineCard } from "./types";
import type { SettingDatas, NovelLibraryService } from "../../../core";
import { TimelineRepository } from "../repository";

export interface TimelineCardListController {
	setSearchKeyword(keyword: string): void;
	setColorFilters(colorHexes: string[]): void;
	createCardAtEnd(preferredFilePath: string | null): Promise<TimelineCard | null>;
	createCardBefore(cardId: string): Promise<TimelineCard | null>;
	createCardAfter(cardId: string): Promise<TimelineCard | null>;
	rerender(): void;
	refresh(): void;
	applyVaultFileCreateOrModify(path: string): void;
	applyVaultFileDelete(path: string): void;
	applyVaultFileRename(oldPath: string, newPath: string): void;
	destroy(): void;
}

interface TimelineCardListDeps {
	app: App;
	containerEl: HTMLElement;
	t: (key: TranslationKey) => string;
	getSettings: () => SettingDatas;
	novelLibraryService: NovelLibraryService;
	getTimelineRootPaths: () => string[];
	onCountChange?: (stats: { total: number; visible: number }) => void;
	initialSearchKeyword?: string;
}

interface TimelineCardListState {
	searchKeyword: string;
	colorFilters: Set<string>;
	cards: TimelineCard[];
}

export function createTimelineCardList(deps: TimelineCardListDeps): TimelineCardListController {
	const state: TimelineCardListState = {
		searchKeyword: deps.initialSearchKeyword ?? "",
		colorFilters: new Set<string>(),
		cards: [],
	};
	const repository = new TimelineRepository(deps.app, deps.novelLibraryService);

	let isDestroyed = false;
	let loadVersion = 0;
	let cardItemDisposers: Array<() => void> = [];
	const fileReadVersionByPath = new Map<string, number>();

	let draggingCardId: string | null = null;
	let draggingTimelinePath: string | null = null;
	let dropIndicatorRowEl: HTMLElement | null = null;
	let dropIndicatorClassName = "";

	const replaceCards = (nextCards: TimelineCard[]): void => {
		state.cards = nextCards;
	};

	const loadCardsFromVault = async (): Promise<void> => {
		const currentLoadVersion = ++loadVersion;
		try {
			const cards = await repository.listCards(deps.getSettings(), deps.getTimelineRootPaths());
			if (isDestroyed || currentLoadVersion !== loadVersion) {
				return;
			}
			replaceCards(cards);
			render();
		} catch (error) {
			if (isDestroyed) {
				return;
			}
			console.error("[Chinese Novel Assistant] Failed to load timeline cards.", error);
			new Notice(deps.t("feature.timeline.notice.load_failed"));
		}
	};

	const replaceCardsByTimelinePath = (timelinePath: string, nextCards: TimelineCard[]): void => {
		const preserved = state.cards.filter((item) => item.timelinePath !== timelinePath);
		state.cards = [...preserved, ...nextCards];
		render();
	};

	const removeCardsByTimelinePath = (timelinePath: string, shouldRender: boolean): boolean => {
		const originalLength = state.cards.length;
		state.cards = state.cards.filter((item) => item.timelinePath !== timelinePath);
		if (state.cards.length === originalLength) {
			return false;
		}
		if (shouldRender) {
			render();
		}
		return true;
	};

	const loadCardsByTimelinePathFromVault = async (timelinePath: string): Promise<void> => {
		const pathReadVersion = (fileReadVersionByPath.get(timelinePath) ?? 0) + 1;
		fileReadVersionByPath.set(timelinePath, pathReadVersion);
		try {
			const nextCards = await repository.getCardsByTimelinePath(timelinePath);
			if (isDestroyed) {
				return;
			}
			if (fileReadVersionByPath.get(timelinePath) !== pathReadVersion) {
				return;
			}
			fileReadVersionByPath.delete(timelinePath);
			replaceCardsByTimelinePath(timelinePath, nextCards);
		} catch (error) {
			fileReadVersionByPath.delete(timelinePath);
			if (!isDestroyed) {
				console.error("[Chinese Novel Assistant] Failed to load timeline file.", error);
				new Notice(deps.t("feature.timeline.notice.load_failed"));
			}
		}
	};

	const persistCard = async (card: TimelineCard): Promise<void> => {
		try {
			await repository.saveCard(card);
		} catch (error) {
			if (isDestroyed) {
				return;
			}
			console.error("[Chinese Novel Assistant] Failed to save timeline card.", error);
			new Notice(deps.t("feature.timeline.notice.save_failed"));
		}
	};

	const deleteCardFromVault = async (card: TimelineCard): Promise<boolean> => {
		try {
			await repository.deleteCard(card);
			return true;
		} catch (error) {
			if (!isDestroyed) {
				console.error("[Chinese Novel Assistant] Failed to delete timeline card.", error);
				new Notice(deps.t("feature.timeline.notice.delete_failed"));
			}
			return false;
		}
	};

	const clearDropIndicator = (): void => {
		if (dropIndicatorRowEl && dropIndicatorClassName) {
			dropIndicatorRowEl.removeClass(dropIndicatorClassName);
		}
		dropIndicatorRowEl = null;
		dropIndicatorClassName = "";
	};

	const applyDropIndicator = (rowEl: HTMLElement, indicator: "before" | "after"): void => {
		const nextClassName = indicator === "before"
			? "cna-timeline-row--drop-before"
			: "cna-timeline-row--drop-after";
		if (dropIndicatorRowEl === rowEl && dropIndicatorClassName === nextClassName) {
			return;
		}
		clearDropIndicator();
		rowEl.addClass(nextClassName);
		dropIndicatorRowEl = rowEl;
		dropIndicatorClassName = nextClassName;
	};

	const clearDragState = (): void => {
		draggingCardId = null;
		draggingTimelinePath = null;
		clearDropIndicator();
	};

	const render = (): void => {
		if (isDestroyed) {
			return;
		}
		for (const dispose of cardItemDisposers) {
			dispose();
		}
		cardItemDisposers = [];
		closeTimelineCardMenu();
		clearDragState();
		deps.containerEl.empty();
		const listEl = deps.containerEl.createDiv({ cls: "cna-timeline-card-list" });
		const visibleCards = getVisibleCards(state);
		deps.onCountChange?.({
			total: state.cards.length,
			visible: visibleCards.length,
		});
		if (visibleCards.length === 0) {
			listEl.addClass("is-empty");
			listEl.createDiv({
				cls: "cna-timeline-card-list__empty",
				text: deps.t("feature.timeline.list.empty"),
			});
			return;
		}

		const hasFilter = state.searchKeyword.trim().length > 0 || state.colorFilters.size > 0;
		const enableDrag = !hasFilter;

		for (const card of visibleCards) {
			const rendered = renderTimelineCardItem({
				app: deps.app,
				containerEl: listEl,
				card,
				t: deps.t,
				onCardTouched: () => {
					void persistCard(card);
					render();
				},
				onCardDelete: () => {
					void (async () => {
						const deleted = await deleteCardFromVault(card);
						if (!deleted || isDestroyed) {
							return;
						}
						state.cards = state.cards.filter((item) => item.id !== card.id);
						render();
					})();
				},
				onInsertBefore: () => {
					void createCardRelative(card.id, "before");
				},
				onInsertAfter: () => {
					void createCardRelative(card.id, "after");
				},
			});
			cardItemDisposers.push(rendered.dispose);

			rendered.rootEl.draggable = enableDrag;
			if (!enableDrag) {
				continue;
			}

			rendered.rootEl.addEventListener("dragstart", (event) => {
				draggingCardId = card.id;
				draggingTimelinePath = card.timelinePath;
				rendered.rootEl.addClass("cna-timeline-row--dragging");
				if (event.dataTransfer) {
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", "timeline-drag");
				}
			});
			rendered.rootEl.addEventListener("dragover", (event) => {
				if (!draggingCardId || !draggingTimelinePath) {
					return;
				}
				if (draggingCardId === card.id || draggingTimelinePath !== card.timelinePath) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = "move";
				}
				const bounds = rendered.rootEl.getBoundingClientRect();
				const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
				applyDropIndicator(rendered.rootEl, position);
			});
			rendered.rootEl.addEventListener("drop", (event) => {
				if (!draggingCardId || !draggingTimelinePath) {
					return;
				}
				if (draggingCardId === card.id || draggingTimelinePath !== card.timelinePath) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				const bounds = rendered.rootEl.getBoundingClientRect();
				const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
				void reorderCardsByDrop(draggingCardId, card.id, card.timelinePath, position);
			});
			rendered.rootEl.addEventListener("dragend", () => {
				rendered.rootEl.removeClass("cna-timeline-row--dragging");
				clearDragState();
			});
		}
	};

	const reorderCardsByDrop = async (
		sourceCardId: string,
		targetCardId: string,
		timelinePath: string,
		position: "before" | "after",
	): Promise<void> => {
		const pathCards = state.cards
			.filter((item) => item.timelinePath === timelinePath)
			.sort(compareCardsByOrder);
		const sourceIndex = pathCards.findIndex((item) => item.id === sourceCardId);
		const targetIndex = pathCards.findIndex((item) => item.id === targetCardId);
		if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
			clearDragState();
			render();
			return;
		}

		const nextIds = pathCards.map((item) => item.id);
		const [movedId] = nextIds.splice(sourceIndex, 1);
		if (!movedId) {
			clearDragState();
			render();
			return;
		}
		const nextTargetIndex = nextIds.findIndex((item) => item === targetCardId);
		if (nextTargetIndex < 0) {
			clearDragState();
			render();
			return;
		}
		const insertIndex = position === "before" ? nextTargetIndex : nextTargetIndex + 1;
		nextIds.splice(insertIndex, 0, movedId);

		for (let index = 0; index < nextIds.length; index += 1) {
			const cardId = nextIds[index];
			if (!cardId) {
				continue;
			}
			const target = state.cards.find((item) => item.id === cardId && item.timelinePath === timelinePath);
			if (!target) {
				continue;
			}
			target.order = (index + 1) * 1024;
			target.updatedAt = Date.now();
		}
		clearDragState();
		render();

		try {
			await repository.reorderCards(timelinePath, nextIds);
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to reorder timeline cards.", error);
			if (!isDestroyed) {
				new Notice(deps.t("feature.timeline.notice.reorder_failed"));
				void loadCardsByTimelinePathFromVault(timelinePath);
			}
		}
	};

	const createCardAtEnd = async (preferredFilePath: string | null): Promise<TimelineCard | null> => {
		try {
			const created = await repository.createCard(deps.getSettings(), preferredFilePath, {
				position: "end",
			});
			await loadCardsByTimelinePathFromVault(created.timelinePath);
			return created;
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to create timeline card.", error);
			new Notice(deps.t("feature.timeline.notice.create_failed"));
			return null;
		}
	};

	const createCardRelative = async (cardId: string, position: "before" | "after"): Promise<TimelineCard | null> => {
		const referenceCard = state.cards.find((item) => item.id === cardId);
		if (!referenceCard) {
			return null;
		}
		try {
			const created = await repository.createCard(deps.getSettings(), null, {
				timelinePath: referenceCard.timelinePath,
				referenceCardId: referenceCard.id,
				position,
			});
			await loadCardsByTimelinePathFromVault(created.timelinePath);
			return created;
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to insert timeline card.", error);
			new Notice(deps.t("feature.timeline.notice.create_failed"));
			return null;
		}
	};

	render();
	void loadCardsFromVault();

	return {
		setSearchKeyword(keyword) {
			if (state.searchKeyword === keyword) {
				return;
			}
			state.searchKeyword = keyword;
			render();
		},
		setColorFilters(colorHexes) {
			const normalized = colorHexes
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
			if (normalized.length === state.colorFilters.size && normalized.every((item) => state.colorFilters.has(item))) {
				return;
			}
			state.colorFilters = new Set(normalized);
			render();
		},
		createCardAtEnd(preferredFilePath) {
			return createCardAtEnd(preferredFilePath);
		},
		createCardBefore(cardId) {
			return createCardRelative(cardId, "before");
		},
		createCardAfter(cardId) {
			return createCardRelative(cardId, "after");
		},
		refresh() {
			void loadCardsFromVault();
		},
		rerender() {
			render();
		},
		applyVaultFileCreateOrModify(path) {
			if (!path || !path.toLowerCase().endsWith(".timeline.md")) {
				return;
			}
			void loadCardsByTimelinePathFromVault(path);
		},
		applyVaultFileDelete(path) {
			if (!path || !path.toLowerCase().endsWith(".timeline.md")) {
				return;
			}
			fileReadVersionByPath.delete(path);
			removeCardsByTimelinePath(path, true);
		},
		applyVaultFileRename(oldPath, newPath) {
			if (oldPath && oldPath !== newPath) {
				fileReadVersionByPath.delete(oldPath);
				removeCardsByTimelinePath(oldPath, false);
			}
			if (newPath && newPath.toLowerCase().endsWith(".timeline.md")) {
				void loadCardsByTimelinePathFromVault(newPath);
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
			for (const dispose of cardItemDisposers) {
				dispose();
			}
			cardItemDisposers = [];
			clearDragState();
			deps.containerEl.empty();
		},
	};
}

function getVisibleCards(state: TimelineCardListState): TimelineCard[] {
	const keyword = state.searchKeyword.trim().toLowerCase();
	const hasColorFilter = state.colorFilters.size > 0;
	const matched = state.cards.filter((card) => {
		if (hasColorFilter) {
			const normalizedColor = card.colorHex?.trim();
			if (!normalizedColor || !state.colorFilters.has(normalizedColor)) {
				return false;
			}
		}
		if (!keyword) {
			return true;
		}
		const searchSpace = `${card.timeText}\n${card.title}\n${card.contentPlainText}`.toLowerCase();
		return searchSpace.includes(keyword);
	});
	return [...matched].sort(compareCardsByOrder);
}

function compareCardsByOrder(left: TimelineCard, right: TimelineCard): number {
	const pathDiff = left.timelinePath.localeCompare(right.timelinePath);
	if (pathDiff !== 0) {
		return pathDiff;
	}
	if (left.order !== right.order) {
		return left.order - right.order;
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left.id.localeCompare(right.id);
}
