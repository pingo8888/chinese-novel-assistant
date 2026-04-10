import { Notice, type App } from "obsidian";
import type { TranslationKey } from "../../../lang";
import { closeAnnotationCardMenu } from "./card-menu";
import { renderAnnotationCardItem } from "./card-item";
import type { AnnotationCard } from "./types";
import type { SettingDatas } from "../../../core";
import { normalizeVaultPath } from "../../../core";
import { AnnotationRepository } from "../repository";

export interface AnnotationCardListController {
	setSearchKeyword(keyword: string): void;
	setColorFilters(colorHexes: string[]): void;
	setSourcePathFilter(sourcePath: string | null): void;
	setAutoLocateFilePath(filePath: string | null): void;
	setActiveCardBySourceOffset(sourcePath: string | null, offset: number | null): void;
	setActiveCardId(cardId: string | null): void;
	rerender(): void;
	refresh(): void;
	applyVaultFileCreateOrModify(path: string): void;
	applyVaultFileDelete(path: string): void;
	applyVaultFileRename(oldPath: string, newPath: string): void;
	destroy(): void;
}

interface AnnotationCardListDeps {
	app: App;
	containerEl: HTMLElement;
	t: (key: TranslationKey) => string;
	getSettings: () => SettingDatas;
	getAnnotationRootPaths: () => string[];
	onCountChange?: (stats: { total: number; visible: number }) => void;
	initialSearchKeyword?: string;
	onLocateCard: (card: AnnotationCard) => void;
}

interface AnnotationCardListState {
	searchKeyword: string;
	colorFilters: Set<string>;
	sourcePathFilter: string | null;
	cards: AnnotationCard[];
	activeCardId: string | null;
}

export function createAnnotationCardList(deps: AnnotationCardListDeps): AnnotationCardListController {
	const state: AnnotationCardListState = {
		searchKeyword: deps.initialSearchKeyword ?? "",
		colorFilters: new Set<string>(),
		sourcePathFilter: null,
		cards: [],
		activeCardId: null,
	};
	const repository = new AnnotationRepository(deps.app);

	let isDestroyed = false;
	let loadVersion = 0;
	let cardItemDisposers: Array<() => void> = [];
	const fileReadVersionByPath = new Map<string, number>();

	const replaceCards = (nextCards: AnnotationCard[]): void => {
		state.cards = nextCards;
	};

	const loadCardsFromVault = async (): Promise<void> => {
		const currentLoadVersion = ++loadVersion;
		try {
			const cards = await repository.listCards(deps.getSettings(), deps.getAnnotationRootPaths());
			if (isDestroyed || currentLoadVersion !== loadVersion) {
				return;
			}
			replaceCards(cards);
			if (state.activeCardId && !cards.some((item) => item.id === state.activeCardId)) {
				state.activeCardId = null;
			}
			render();
		} catch (error) {
			if (isDestroyed) {
				return;
			}
			console.error("[Chinese Novel Assistant] Failed to load annotations.", error);
			new Notice(deps.t("feature.annotation.notice.load_failed"));
		}
	};

	const removeCardsByAnnoPath = (annoPath: string, shouldRender: boolean): boolean => {
		const originalLength = state.cards.length;
		state.cards = state.cards.filter((item) => item.annoPath !== annoPath);
		if (state.cards.length === originalLength) {
			return false;
		}
		if (state.activeCardId && !state.cards.some((item) => item.id === state.activeCardId)) {
			state.activeCardId = null;
		}
		if (shouldRender) {
			render();
		}
		return true;
	};

	const replaceCardsByAnnoPath = (annoPath: string, nextCards: AnnotationCard[]): void => {
		const preserved = state.cards.filter((item) => item.annoPath !== annoPath);
		state.cards = [...preserved, ...nextCards];
		if (state.activeCardId && !state.cards.some((item) => item.id === state.activeCardId)) {
			state.activeCardId = null;
		}
		render();
	};

	const loadCardsByAnnoPathFromVault = async (annoPath: string): Promise<void> => {
		const pathReadVersion = (fileReadVersionByPath.get(annoPath) ?? 0) + 1;
		fileReadVersionByPath.set(annoPath, pathReadVersion);
		try {
			const nextCards = await repository.getCardsByAnnoPath(annoPath);
			if (isDestroyed) {
				return;
			}
			if (fileReadVersionByPath.get(annoPath) !== pathReadVersion) {
				return;
			}
			fileReadVersionByPath.delete(annoPath);
			replaceCardsByAnnoPath(annoPath, nextCards);
		} catch (error) {
			fileReadVersionByPath.delete(annoPath);
			if (!isDestroyed) {
				console.error("[Chinese Novel Assistant] Failed to load annotation file.", error);
				new Notice(deps.t("feature.annotation.notice.load_failed"));
			}
		}
	};

	const persistCard = async (card: AnnotationCard): Promise<void> => {
		try {
			await repository.saveCard(card);
		} catch (error) {
			if (isDestroyed) {
				return;
			}
			console.error("[Chinese Novel Assistant] Failed to save annotation.", error);
			new Notice(deps.t("feature.annotation.notice.save_failed"));
		}
	};

	const deleteCardFromVault = async (card: AnnotationCard): Promise<boolean> => {
		try {
			await repository.deleteCard(card);
			return true;
		} catch (error) {
			if (!isDestroyed) {
				console.error("[Chinese Novel Assistant] Failed to delete annotation.", error);
				new Notice(deps.t("feature.annotation.notice.delete_failed"));
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
		closeAnnotationCardMenu();
		deps.containerEl.empty();
		const listEl = deps.containerEl.createDiv({ cls: "cna-annotation-card-list" });
		const visibleCards = getVisibleCards(state);
		deps.onCountChange?.({
			total: state.cards.length,
			visible: visibleCards.length,
		});
		if (visibleCards.length === 0) {
			listEl.createDiv({
				cls: "cna-annotation-card-list__empty",
				text: deps.t("feature.annotation.list.empty"),
			});
			return;
		}

		for (const card of visibleCards) {
			const disposeCardItem = renderAnnotationCardItem({
				app: deps.app,
				containerEl: listEl,
				card,
				t: deps.t,
				getSettings: deps.getSettings,
				isActive: card.id === state.activeCardId,
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
						if (state.activeCardId === card.id) {
							state.activeCardId = null;
						}
						render();
					})();
				},
				onLocate: () => {
					deps.onLocateCard(card);
				},
			});
			cardItemDisposers.push(disposeCardItem);
		}

	};

	const setAutoLocateFilePath = (filePath: string | null): void => {
		const visibleCards = getVisibleCards(state);
		if (visibleCards.length === 0) {
			if (state.activeCardId !== null) {
				state.activeCardId = null;
				render();
			}
			return;
		}
		const normalizedPath = normalizeVaultPath(filePath ?? "");
		const targetCard = normalizedPath
			? (visibleCards.find((item) => normalizeVaultPath(item.sourcePath) === normalizedPath) ?? visibleCards[visibleCards.length - 1])
			: visibleCards[visibleCards.length - 1];
		if (!targetCard) {
			return;
		}
		if (state.activeCardId === targetCard.id) {
			return;
		}
		state.activeCardId = targetCard.id;
		render();
	};

	const setActiveCardBySourceOffset = (sourcePath: string | null, offset: number | null): void => {
		if (!sourcePath || offset === null || !Number.isFinite(offset)) {
			return;
		}
		const visibleCards = getVisibleCards(state);
		if (visibleCards.length === 0) {
			return;
		}
		const normalizedPath = normalizeVaultPath(sourcePath);
		if (!normalizedPath) {
			return;
		}
		const targetCard = resolveNearestCardByOffset(visibleCards, normalizedPath, Math.max(0, Math.round(offset)));
		if (!targetCard) {
			return;
		}
		if (state.activeCardId === targetCard.id) {
			return;
		}
		state.activeCardId = targetCard.id;
		render();
	};

	const setActiveCardId = (cardId: string | null): void => {
		if (!cardId) {
			if (state.activeCardId === null) {
				return;
			}
			state.activeCardId = null;
			render();
			return;
		}
		const exists = state.cards.some((item) => item.id === cardId);
		if (!exists) {
			return;
		}
		if (state.activeCardId === cardId) {
			return;
		}
		state.activeCardId = cardId;
		render();
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
				.map((item) => item.trim().toUpperCase())
				.filter((item) => item.length > 0);
			if (normalized.length === state.colorFilters.size && normalized.every((item) => state.colorFilters.has(item))) {
				return;
			}
			state.colorFilters = new Set(normalized);
			render();
		},
		setSourcePathFilter(sourcePath) {
			const normalized = normalizeVaultPath(sourcePath ?? "");
			const nextFilter = normalized.length > 0 ? normalized : null;
			if (state.sourcePathFilter === nextFilter) {
				return;
			}
			state.sourcePathFilter = nextFilter;
			render();
		},
		setAutoLocateFilePath(filePath) {
			setAutoLocateFilePath(filePath);
		},
		setActiveCardBySourceOffset(sourcePath, offset) {
			setActiveCardBySourceOffset(sourcePath, offset);
		},
		setActiveCardId(cardId) {
			setActiveCardId(cardId);
		},
		refresh() {
			void loadCardsFromVault();
		},
		rerender() {
			render();
		},
		applyVaultFileCreateOrModify(path) {
			if (!path || !path.toLowerCase().endsWith(".anno.md")) {
				return;
			}
			void loadCardsByAnnoPathFromVault(path);
		},
		applyVaultFileDelete(path) {
			if (!path || !path.toLowerCase().endsWith(".anno.md")) {
				return;
			}
			fileReadVersionByPath.delete(path);
			removeCardsByAnnoPath(path, true);
		},
		applyVaultFileRename(oldPath, newPath) {
			if (oldPath && oldPath !== newPath) {
				fileReadVersionByPath.delete(oldPath);
				removeCardsByAnnoPath(oldPath, false);
			}
			if (newPath && newPath.toLowerCase().endsWith(".anno.md")) {
				void loadCardsByAnnoPathFromVault(newPath);
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
			deps.containerEl.empty();
		},
	};
}

function getVisibleCards(state: AnnotationCardListState): AnnotationCard[] {
	const keyword = state.searchKeyword.trim().toLowerCase();
	const hasColorFilter = state.colorFilters.size > 0;
	const sourcePathFilter = state.sourcePathFilter;
	const matched = state.cards.filter((card) => {
		if (sourcePathFilter && normalizeVaultPath(card.sourcePath) !== sourcePathFilter) {
			return false;
		}
		if (hasColorFilter) {
			const normalizedColor = card.colorHex?.trim().toUpperCase();
			if (!normalizedColor || !state.colorFilters.has(normalizedColor)) {
				return false;
			}
		}
		if (!keyword) {
			return true;
		}
		const searchSpace = `${card.title}\n${card.anchorText}\n${card.contentPlainText}`.toLowerCase();
		return searchSpace.includes(keyword);
	});
	return [...matched].sort(compareCardsBySourceOrder);
}

function resolveNearestCardByOffset(cards: AnnotationCard[], normalizedSourcePath: string, offset: number): AnnotationCard | null {
	let bestCard: AnnotationCard | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const card of cards) {
		if (normalizeVaultPath(card.sourcePath) !== normalizedSourcePath) {
			continue;
		}
		const from = Math.max(0, Math.round(card.anchorOffset));
		const to = Math.max(from + 1, Math.round(card.anchorEndOffset));
		let distance = 0;
		if (offset < from) {
			distance = from - offset;
		} else if (offset > to) {
			distance = offset - to;
		}
		if (
			bestCard === null ||
			distance < bestDistance ||
			(distance === bestDistance && (from < Math.max(0, Math.round(bestCard.anchorOffset))))
		) {
			bestCard = card;
			bestDistance = distance;
		}
	}
	return bestCard;
}

function compareCardsBySourceOrder(left: AnnotationCard, right: AnnotationCard): number {
	const pathDiff = left.sourcePath.localeCompare(right.sourcePath);
	if (pathDiff !== 0) {
		return pathDiff;
	}
	if (left.line !== right.line) {
		return left.line - right.line;
	}
	if (left.ch !== right.ch) {
		return left.ch - right.ch;
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left.id.localeCompare(right.id);
}

