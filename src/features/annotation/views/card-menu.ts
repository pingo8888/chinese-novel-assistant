import { setIcon } from "obsidian";
import { STICKY_NOTE_COLORS, UI } from "../../../core";
import type { TranslationKey } from "../../../lang";
import type { AnnotationCardMenuCommand } from "../menu-actions";
import { toRgba } from "../utils";

interface ShowAnnotationCardMenuArgs {
	anchorEl: HTMLElement;
	t: (key: TranslationKey) => string;
	activeColorHex?: string;
	onCommand: (command: AnnotationCardMenuCommand) => void;
}

interface ActiveAnnotationCardMenu {
	rootEl: HTMLElement;
	cleanup: () => void;
}

let activeMenu: ActiveAnnotationCardMenu | null = null;

export function closeAnnotationCardMenu(): void {
	if (!activeMenu) {
		return;
	}
	activeMenu.cleanup();
	activeMenu = null;
}

export function showAnnotationCardMenu(args: ShowAnnotationCardMenuArgs): void {
	closeAnnotationCardMenu();

	const rootEl = document.body.createDiv({ cls: "cna-annotation-card-menu" });

	const paletteEl = rootEl.createDiv({ cls: "cna-annotation-card-menu__palette" });
	for (const colorHex of STICKY_NOTE_COLORS) {
		const colorButtonEl = paletteEl.createEl("button", {
			cls: "cna-annotation-card-menu__color",
			attr: {
				type: "button",
			},
		});
		colorButtonEl.style.setProperty("--cna-annotation-card-menu-color", colorHex);
		colorButtonEl.style.setProperty("--cna-annotation-card-menu-color-alpha", toRgba(colorHex, 0.25));
		if (args.activeColorHex === colorHex) {
			colorButtonEl.addClass("is-active");
		}
		colorButtonEl.addEventListener("click", () => {
			args.onCommand({ type: "set_color", colorHex });
			closeAnnotationCardMenu();
		});
	}

	rootEl.createDiv({ cls: "cna-annotation-card-menu__divider" });

	const deleteItemEl = createMenuItemButton(
		rootEl,
		UI.ICON.DELETE,
		args.t("feature.annotation.menu.delete"),
		true,
	);
	deleteItemEl.addEventListener("click", () => {
		args.onCommand({ type: "delete" });
		closeAnnotationCardMenu();
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
		closeAnnotationCardMenu();
	};
	const onKeydown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			closeAnnotationCardMenu();
		}
	};
	const onViewportChange = (): void => {
		closeAnnotationCardMenu();
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
		cls: "cna-annotation-card-menu__item",
		attr: {
			type: "button",
		},
	});
	if (danger) {
		itemEl.addClass("is-danger");
	}
	const iconEl = itemEl.createSpan({ cls: "cna-annotation-card-menu__item-icon" });
	setIcon(iconEl, icon);
	itemEl.createSpan({ cls: "cna-annotation-card-menu__item-label", text });
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
