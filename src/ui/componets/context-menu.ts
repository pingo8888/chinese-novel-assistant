import { Menu, type IconName } from "obsidian";

export interface ContextMenuItemOption {
	kind?: "item";
	title: string;
	icon?: IconName | null;
	checked?: boolean | null;
	disabled?: boolean;
	warning?: boolean;
	section?: string;
	onClick?: (evt: MouseEvent | KeyboardEvent) => void;
}

export interface ContextMenuSeparatorOption {
	kind: "separator";
}

export type ContextMenuOption = ContextMenuItemOption | ContextMenuSeparatorOption;

export function showContextMenuAtMouseEvent(event: MouseEvent, options: ContextMenuOption[]): void {
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
}
