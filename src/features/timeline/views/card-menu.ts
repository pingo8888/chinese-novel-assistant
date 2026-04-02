import { setIcon } from "obsidian";
import { UI } from "../../../core";
import type { TranslationKey } from "../../../lang";
import type { TimelineCardMenuCommand } from "../menu-actions";
import { toRgba } from "../../../utils";
import { TIMELINE_COLOR_TYPES } from "../color-types";

interface ShowTimelineCardMenuArgs {
	anchorEl: HTMLElement;
	t: (key: TranslationKey) => string;
	activeColorHex?: string;
	onCommand: (command: TimelineCardMenuCommand) => void;
}

interface ActiveTimelineCardMenu {
	rootEl: HTMLElement;
	cleanup: () => void;
}

let activeMenu: ActiveTimelineCardMenu | null = null;

export function closeTimelineCardMenu(): void {
	if (!activeMenu) {
		return;
	}
	activeMenu.cleanup();
	activeMenu = null;
}

export function showTimelineCardMenu(args: ShowTimelineCardMenuArgs): void {
	closeTimelineCardMenu();

	const rootEl = document.body.createDiv({ cls: "cna-timeline-card-menu" });

	const paletteEl = rootEl.createDiv({ cls: "cna-timeline-card-menu__palette" });
	for (const colorType of TIMELINE_COLOR_TYPES) {
		const colorHex = colorType.colorHex;
		const colorButtonEl = paletteEl.createEl("button", {
			cls: "cna-timeline-card-menu__color",
			attr: {
				type: "button",
			},
		});
		colorButtonEl.style.setProperty("--cna-timeline-card-menu-color", colorHex);
		colorButtonEl.style.setProperty("--cna-timeline-card-menu-color-alpha", toRgba(colorHex, 0.25));
		if (args.activeColorHex === colorHex) {
			colorButtonEl.addClass("is-active");
		}
		colorButtonEl.addEventListener("click", () => {
			args.onCommand({ type: "set_color", colorHex });
			closeTimelineCardMenu();
		});
	}

	rootEl.createDiv({ cls: "cna-timeline-card-menu__divider" });

	const insertBeforeItemEl = createMenuItemButton(
		rootEl,
		UI.ICON.TIME_LINE_ADD_UP,
		args.t("feature.timeline.menu.insert_before"),
	);
	insertBeforeItemEl.addEventListener("click", () => {
		args.onCommand({ type: "insert_before" });
		closeTimelineCardMenu();
	});

	const insertAfterItemEl = createMenuItemButton(
		rootEl,
		UI.ICON.TIME_LINE_ADD_BELOW,
		args.t("feature.timeline.menu.insert_after"),
	);
	insertAfterItemEl.addEventListener("click", () => {
		args.onCommand({ type: "insert_after" });
		closeTimelineCardMenu();
	});

	const deleteItemEl = createMenuItemButton(
		rootEl,
		UI.ICON.DELETE,
		args.t("feature.timeline.menu.delete"),
		true,
	);
	deleteItemEl.addEventListener("click", () => {
		args.onCommand({ type: "delete" });
		closeTimelineCardMenu();
	});

	positionMenu(rootEl, args.anchorEl.getBoundingClientRect());

	const onPointerDown = (event: PointerEvent): void => {
		const target = event.target;
		if (!(target instanceof Node)) {
			return;
		}
		if (rootEl.contains(target) || args.anchorEl.contains(target)) {
			return;
		}
		closeTimelineCardMenu();
	};
	const onKeydown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			closeTimelineCardMenu();
		}
	};
	const onViewportChange = (): void => {
		closeTimelineCardMenu();
	};
	document.addEventListener("pointerdown", onPointerDown, true);
	document.addEventListener("keydown", onKeydown, true);
	window.addEventListener("resize", onViewportChange, true);
	window.addEventListener("scroll", onViewportChange, true);

	activeMenu = {
		rootEl,
		cleanup: () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeydown, true);
			window.removeEventListener("resize", onViewportChange, true);
			window.removeEventListener("scroll", onViewportChange, true);
			rootEl.remove();
		},
	};
}

function createMenuItemButton(rootEl: HTMLElement, icon: string, text: string, danger = false): HTMLButtonElement {
	const itemEl = rootEl.createEl("button", {
		cls: "cna-timeline-card-menu__item",
		attr: {
			type: "button",
		},
	});
	if (danger) {
		itemEl.addClass("is-danger");
	}
	const iconEl = itemEl.createSpan({ cls: "cna-timeline-card-menu__item-icon" });
	setIcon(iconEl, icon);
	itemEl.createSpan({ cls: "cna-timeline-card-menu__item-label", text });
	return itemEl;
}

function positionMenu(menuEl: HTMLElement, anchorRect: DOMRect): void {
	const margin = 8;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	const menuRect = menuEl.getBoundingClientRect();
	let left = anchorRect.right - menuRect.width;
	let top = anchorRect.bottom + 6;

	left = Math.min(Math.max(margin, left), Math.max(margin, viewportWidth - menuRect.width - margin));
	top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - menuRect.height - margin));

	menuEl.setCssProps({
		left: `${left}px`,
		top: `${top}px`,
	});
}
