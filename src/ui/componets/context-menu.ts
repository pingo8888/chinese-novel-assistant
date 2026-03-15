import { Menu, type IconName } from "obsidian";

export interface ContextMenuItemOption {
	kind?: "item";
	title: string;
	icon?: IconName | null;
	checked?: boolean | null;
	disabled?: boolean;
	warning?: boolean;
	section?: string;
	colorHex?: string | null;
	onClick?: (evt: MouseEvent | KeyboardEvent) => void;
}

export interface ContextMenuSeparatorOption {
	kind: "separator";
}

export type ContextMenuOption = ContextMenuItemOption | ContextMenuSeparatorOption;

interface ColorSwatchMeta {
	colorHex: string;
	useIconSlot: boolean;
}

export interface MenuColorSwatchOption {
	title: string;
	colorHex: string;
	useIconSlot?: boolean;
}

export interface ContextMenuRenderOption {
	menuClassName?: string;
	keepInViewport?: boolean;
}

export function showContextMenuAtMouseEvent(
	event: MouseEvent,
	options: ContextMenuOption[],
	renderOption?: ContextMenuRenderOption,
): void {
	const menu = new Menu();

	for (const option of options) {
		if (option.kind === "separator") {
			menu.addSeparator();
			continue;
		}

		menu.addItem((item) => {
			item.setTitle(option.title);
			if (option.icon !== undefined) {
				item.setIcon(option.icon);
			}
			if (option.checked !== undefined) {
				item.setChecked(option.checked);
			}
			if (option.section) {
				item.setSection(option.section);
			}
			if (option.disabled) {
				item.setDisabled(true);
			}
			if (option.warning) {
				item.setWarning(true);
			}
			if (option.onClick) {
				item.onClick(option.onClick);
			}
		});
	}

	menu.showAtMouseEvent(event);
	if (renderOption?.menuClassName) {
		scheduleAttachClassToLatestMenu(renderOption.menuClassName);
	}
	if (renderOption?.keepInViewport) {
		scheduleFitLatestMenuWithinViewport();
	}
	const swatchOptions: MenuColorSwatchOption[] = [];
	for (const option of options) {
		if (option.kind === "separator") {
			continue;
		}
		const colorHex = option.colorHex?.trim();
		if (!colorHex) {
			continue;
		}
		swatchOptions.push({
			title: option.title,
			colorHex,
			useIconSlot: option.icon === undefined || option.icon === null,
		});
	}
	scheduleAttachColorSwatchesToLatestMenu(swatchOptions);
	if (renderOption?.keepInViewport && swatchOptions.length > 0) {
		scheduleFitLatestMenuWithinViewport();
	}
}

function scheduleAttachClassToLatestMenu(className: string): void {
	window.requestAnimationFrame(() => {
		const menuEls = Array.from(document.body.querySelectorAll<HTMLElement>(".menu"));
		const latestMenuEl = menuEls[menuEls.length - 1];
		if (!latestMenuEl) {
			return;
		}
		latestMenuEl.addClass(className);
	});
}

function scheduleFitLatestMenuWithinViewport(): void {
	window.requestAnimationFrame(() => {
		fitLatestMenuWithinViewport();
	});
}

function fitLatestMenuWithinViewport(): void {
	const menuEls = Array.from(document.body.querySelectorAll<HTMLElement>(".menu"));
	const latestMenuEl = menuEls[menuEls.length - 1];
	if (!latestMenuEl) {
		return;
	}
	fitMenuWithinViewport(latestMenuEl);
}

function fitMenuWithinViewport(menuEl: HTMLElement): void {
	const margin = 8;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const rect = menuEl.getBoundingClientRect();
	if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
		return;
	}
	let nextLeft = Number.parseFloat(menuEl.style.left || `${rect.left}`);
	let nextTop = Number.parseFloat(menuEl.style.top || `${rect.top}`);
	if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) {
		return;
	}
	if (rect.right > viewportWidth - margin) {
		nextLeft -= rect.right - (viewportWidth - margin);
	}
	if (rect.left < margin) {
		nextLeft += margin - rect.left;
	}
	if (rect.bottom > viewportHeight - margin) {
		nextTop -= rect.bottom - (viewportHeight - margin);
	}
	if (rect.top < margin) {
		nextTop += margin - rect.top;
	}
	menuEl.style.left = `${Math.round(nextLeft)}px`;
	menuEl.style.top = `${Math.round(nextTop)}px`;
}

export function scheduleAttachColorSwatchesToLatestMenu(options: MenuColorSwatchOption[]): void {
	if (options.length === 0) {
		return;
	}
	window.requestAnimationFrame(() => {
		attachColorSwatchesToLatestMenu(options);
	});
}

function attachColorSwatchesToLatestMenu(options: MenuColorSwatchOption[]): void {
	const menuEls = Array.from(document.body.querySelectorAll<HTMLElement>(".menu"));
	const latestMenuEl = menuEls[menuEls.length - 1];
	if (!latestMenuEl) {
		return;
	}
	attachColorSwatchesToMenu(latestMenuEl, options);
}

function attachColorSwatchesToMenu(menuEl: HTMLElement, options: MenuColorSwatchOption[]): void {
	const colorMetaByTitle = new Map<string, ColorSwatchMeta>();
	for (const option of options) {
		const colorHex = option.colorHex.trim();
		if (!colorHex) {
			continue;
		}
		colorMetaByTitle.set(option.title.trim(), {
			colorHex,
			useIconSlot: option.useIconSlot ?? true,
		});
	}
	if (colorMetaByTitle.size === 0) {
		return;
	}

	const menuTitleEls = Array.from(menuEl.querySelectorAll<HTMLElement>(".menu-item-title"));
	for (const titleEl of menuTitleEls) {
		const titleText = titleEl.textContent?.trim() ?? "";
		const meta = colorMetaByTitle.get(titleText);
		if (!meta) {
			continue;
		}
		const colorChipEl = createColorChip(meta.colorHex);
		if (meta.useIconSlot) {
			const menuItemEl = titleEl.closest<HTMLElement>(".menu-item");
			const iconEl = menuItemEl?.querySelector<HTMLElement>(".menu-item-icon");
			if (iconEl) {
				if (iconEl.querySelector(".cna-context-menu-color-chip")) {
					continue;
				}
				iconEl.empty();
				iconEl.addClass("cna-context-menu-color-chip-slot");
				iconEl.append(colorChipEl);
				continue;
			}
		}
		if (titleEl.querySelector(".cna-context-menu-color-chip")) {
			continue;
		}
		titleEl.prepend(colorChipEl);
	}
}

function createColorChip(colorHex: string): HTMLSpanElement {
	const colorChipEl = document.createElement("span");
	colorChipEl.className = "cna-context-menu-color-chip";
	colorChipEl.style.setProperty("--cna-context-menu-color", colorHex);
	colorChipEl.style.setProperty("--cna-context-menu-color-alpha", toRgba(colorHex, 0.25));
	return colorChipEl;
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
