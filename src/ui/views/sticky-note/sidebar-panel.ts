import type { SidebarViewRenderContext } from "../guidebook/types";
import { setIcon } from "obsidian";
import { UI } from "../../../constants";
import { ClearableInputComponent } from "../../componets/clearable-input";
import { showContextMenuAtMouseEvent } from "../../componets/context-menu";

type StickyNoteSortMode =
	| "created_desc"
	| "created_asc"
	| "modified_desc"
	| "modified_asc";
type StickyNoteTitleKey = "feature.right_sidebar.sticky_note.title";
type StickyNoteSparklesTooltipKey = "feature.right_sidebar.sticky_note.action.sparkles.tooltip";
type StickyNoteSortTooltipKey =
	| "feature.right_sidebar.sticky_note.sort.tooltip.desc"
	| "feature.right_sidebar.sticky_note.sort.tooltip.asc";

const STICKY_NOTE_SORT_MENU_SECTION = "cna-sticky-note-sort";

export function renderStickyNoteSidebarPanel(containerEl: HTMLElement, ctx: SidebarViewRenderContext): () => void {
	const rootEl = containerEl.createDiv({ cls: "cna-right-sidebar-guidebook" });
	const headerEl = rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__header" });
	headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__header-spacer" });

	const titleEl = headerEl.createDiv({ cls: "cna-right-sidebar-guidebook__title" });
	const titleIconEl = titleEl.createSpan({ cls: "cna-right-sidebar-guidebook__title-icon" });
	setIcon(titleIconEl, UI.icon.stickyNote);
	const titleTextEl = titleEl.createSpan({
		cls: "cna-right-sidebar-guidebook__title-text",
	});

	const actionButtonEl = headerEl.createEl("button", {
		cls: "cna-right-sidebar-guidebook__toggle-button",
		attr: {
			type: "button",
		},
	});
	setIcon(actionButtonEl, UI.icon.sparkles);

	rootEl.createDiv({ cls: "cna-right-sidebar-guidebook__divider" });
	const contentEl = rootEl.createDiv({ cls: "cna-right-sidebar-sticky-note__content" });
	const toolbarEl = contentEl.createDiv({ cls: "cna-right-sidebar-sticky-note__toolbar" });
	const searchWrapEl = toolbarEl.createDiv({ cls: "cna-right-sidebar-sticky-note__search-wrap" });

	new ClearableInputComponent({
		containerEl: searchWrapEl,
		containerClassName: "cna-sticky-note-search-input-container",
		placeholder: "",
		clearAriaLabel: "",
		onChange: (_value) => {
			// Reserved for sticky-note search filtering.
		},
	});
	const searchInputEl = searchWrapEl.querySelector<HTMLInputElement>("input");
	const searchClearButtonEl = searchWrapEl.querySelector<HTMLElement>(".search-input-clear-button");

	const sortButtonEl = toolbarEl.createEl("button", {
		cls: "cna-right-sidebar-sticky-note__sort-button",
		attr: {
			type: "button",
		},
	});
	const placeholderEl = contentEl.createDiv({
		cls: "cna-right-sidebar-panel-placeholder",
		text: ctx.t("settings.tab.coming_soon"),
	});

	let sortMode: StickyNoteSortMode = "created_desc";
	const updateSortButton = () => {
		sortButtonEl.empty();
		const iconName =
			sortMode === "created_desc" || sortMode === "modified_desc"
				? UI.icon.calendarArrowDown
				: UI.icon.calendarArrowUp;
		setIcon(sortButtonEl, iconName);
		sortButtonEl.setAttr("aria-label", ctx.t(getSortDirectionTooltipKey(sortMode)));
	};

	const updateLocalizedText = () => {
		titleTextEl.setText(ctx.t(getStickyNoteTitleKey()));
		actionButtonEl.setAttr("aria-label", ctx.t(getSparklesTooltipKey()));
		searchInputEl?.setAttr("placeholder", ctx.t("feature.right_sidebar.sticky_note.search.placeholder"));
		searchClearButtonEl?.setAttr("aria-label", ctx.t("feature.right_sidebar.sticky_note.search.clear"));
		updateSortButton();
		placeholderEl.setText(ctx.t("settings.tab.coming_soon"));
	};

	const openSortMenu = (event: MouseEvent): void => {
		showContextMenuAtMouseEvent(event, [
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.created_desc"),
				icon: UI.icon.calendarArrowDown,
				checked: sortMode === "created_desc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "created_desc";
					updateSortButton();
				},
			},
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.created_asc"),
				icon: UI.icon.calendarArrowUp,
				checked: sortMode === "created_asc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "created_asc";
					updateSortButton();
				},
			},
			{ kind: "separator" },
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.modified_desc"),
				icon: UI.icon.calendarArrowDown,
				checked: sortMode === "modified_desc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "modified_desc";
					updateSortButton();
				},
			},
			{
				title: ctx.t("feature.right_sidebar.sticky_note.sort.modified_asc"),
				icon: UI.icon.calendarArrowUp,
				checked: sortMode === "modified_asc",
				section: STICKY_NOTE_SORT_MENU_SECTION,
				onClick: () => {
					sortMode = "modified_asc";
					updateSortButton();
				},
			},
		]);
	};
	sortButtonEl.addEventListener("click", openSortMenu);
	updateLocalizedText();
	const disposeSettingsChange = ctx.onSettingsChange?.(() => {
		updateLocalizedText();
	});

	return () => {
		sortButtonEl.removeEventListener("click", openSortMenu);
		disposeSettingsChange?.();
	};
}

function getStickyNoteTitleKey(): StickyNoteTitleKey {
	return "feature.right_sidebar.sticky_note.title";
}

function getSparklesTooltipKey(): StickyNoteSparklesTooltipKey {
	return "feature.right_sidebar.sticky_note.action.sparkles.tooltip";
}

function getSortDirectionTooltipKey(mode: StickyNoteSortMode): StickyNoteSortTooltipKey {
	switch (mode) {
		case "created_desc":
		case "modified_desc":
			return "feature.right_sidebar.sticky_note.sort.tooltip.desc";
		case "created_asc":
		case "modified_asc":
			return "feature.right_sidebar.sticky_note.sort.tooltip.asc";
		default:
			return "feature.right_sidebar.sticky_note.sort.tooltip.desc";
	}
}
