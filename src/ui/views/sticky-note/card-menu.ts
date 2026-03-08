import { setIcon } from "obsidian";
import { STICKY_NOTE_CARD_COLORS, UI } from "../../../constants";
import type { TranslationKey } from "../../../lang";
import type { StickyNoteCardMenuCommand } from "../../../features/sticky-note/menu-actions";

interface ShowStickyNoteCardMenuArgs {
	anchorEl: HTMLElement;
	t: (key: TranslationKey) => string;
	activeColorHex?: string;
	isPinned: boolean;
	allowPinToggle?: boolean;
	allowDelete?: boolean;
	onCommand: (command: StickyNoteCardMenuCommand) => void;
}

interface ActiveStickyNoteCardMenu {
	rootEl: HTMLElement;
	cleanup: () => void;
}

let activeMenu: ActiveStickyNoteCardMenu | null = null;

export function closeStickyNoteCardMenu(): void {
	if (!activeMenu) {
		return;
	}
	activeMenu.cleanup();
	activeMenu = null;
}

export function showStickyNoteCardMenu(args: ShowStickyNoteCardMenuArgs): void {
	closeStickyNoteCardMenu();
	const allowPinToggle = args.allowPinToggle ?? true;
	const allowDelete = args.allowDelete ?? true;

	const rootEl = document.body.createDiv({ cls: "cna-sticky-note-card-menu" });

	const paletteEl = rootEl.createDiv({ cls: "cna-sticky-note-card-menu__palette" });
	for (const colorHex of STICKY_NOTE_CARD_COLORS) {
		const colorButtonEl = paletteEl.createEl("button", {
			cls: "cna-sticky-note-card-menu__color",
			attr: {
				type: "button",
			},
		});
		colorButtonEl.style.setProperty("--cna-sticky-note-card-menu-color", colorHex);
		colorButtonEl.style.setProperty("--cna-sticky-note-card-menu-color-alpha", toRgba(colorHex, 0.25));
		if (args.activeColorHex === colorHex) {
			colorButtonEl.addClass("is-active");
		}
		colorButtonEl.addEventListener("click", () => {
			args.onCommand({ type: "set_color", colorHex });
			closeStickyNoteCardMenu();
		});
	}

	rootEl.createDiv({ cls: "cna-sticky-note-card-menu__divider" });

	const pinItemEl = createMenuItemButton(rootEl, UI.icon.pin, args.isPinned
		? args.t("feature.right_sidebar.sticky_note.card.menu.unpin")
		: args.t("feature.right_sidebar.sticky_note.card.menu.pin"));
	if (!allowPinToggle) {
		pinItemEl.addClass("is-disabled");
	} else {
		pinItemEl.addEventListener("click", () => {
			args.onCommand({ type: "toggle_pin" });
			closeStickyNoteCardMenu();
		});
	}

	const deleteItemEl = createMenuItemButton(
		rootEl,
		UI.icon.delete,
		args.t("feature.right_sidebar.sticky_note.card.menu.delete"),
		true,
	);
	if (!allowDelete) {
		deleteItemEl.addClass("is-disabled");
	} else {
		deleteItemEl.addEventListener("click", () => {
			args.onCommand({ type: "delete" });
			closeStickyNoteCardMenu();
		});
	}

	positionMenu(rootEl, args.anchorEl.getBoundingClientRect());

	const onPointerDown = (event: PointerEvent): void => {
		const target = event.target;
		if (!(target instanceof Node)) {
			return;
		}
		if (rootEl.contains(target) || args.anchorEl.contains(target)) {
			return;
		}
		closeStickyNoteCardMenu();
	};
	const onKeydown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			closeStickyNoteCardMenu();
		}
	};
	const onViewportChange = (): void => {
		closeStickyNoteCardMenu();
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
		cls: "cna-sticky-note-card-menu__item",
		attr: {
			type: "button",
		},
	});
	if (danger) {
		itemEl.addClass("is-danger");
	}
	const iconEl = itemEl.createSpan({ cls: "cna-sticky-note-card-menu__item-icon" });
	setIcon(iconEl, icon);
	itemEl.createSpan({ cls: "cna-sticky-note-card-menu__item-label", text });
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

function toRgba(hex: string, alpha: number): string {
	const normalized = hex.trim().replace("#", "");
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		return hex;
	}
	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	const clampedAlpha = Math.max(0, Math.min(1, alpha));
	return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}
