import type { TranslationKey } from "../../../lang";
import { UI } from "../../../core";
import { showContextMenuAtMouseEvent } from "../../../ui";
import type { StickyNoteRichTextCommand } from "../menu-actions";

interface StickyNoteContentMenuItem {
	command: StickyNoteRichTextCommand;
	labelKey: TranslationKey;
	icon: string;
	warning?: boolean;
}

interface StickyNoteContentMenuSeparator {
	kind: "separator";
}

type StickyNoteContentMenuOption = StickyNoteContentMenuItem | StickyNoteContentMenuSeparator;

interface ShowStickyNoteContentMenuArgs {
	event: MouseEvent;
	editorEl: HTMLTextAreaElement;
	t: (key: TranslationKey) => string;
	onCommand: (command: StickyNoteRichTextCommand) => void;
}

const CONTENT_MENU_ITEMS: StickyNoteContentMenuOption[] = [
	{
		command: "bold",
		labelKey: "feature.sticky_note.rich_menu.bold",
		icon: UI.ICON.BOLD,
	},
	{
		command: "italic",
		labelKey: "feature.sticky_note.rich_menu.italic",
		icon: UI.ICON.ITALIC,
	},
	{
		command: "strikethrough",
		labelKey: "feature.sticky_note.rich_menu.strikethrough",
		icon: UI.ICON.STRIKETHROUGH,
	},
	{
		command: "highlight",
		labelKey: "feature.sticky_note.rich_menu.highlight",
		icon: UI.ICON.HIGHLIGHTER,
	},
	{
		kind: "separator",
	},
	{
		command: "unordered",
		labelKey: "feature.sticky_note.rich_menu.unordered",
		icon: UI.ICON.LIST,
	},
	{
		command: "ordered",
		labelKey: "feature.sticky_note.rich_menu.ordered",
		icon: UI.ICON.LIST_ORDERED,
	},
	{
		kind: "separator",
	},
	{
		command: "clear_format",
		labelKey: "feature.sticky_note.rich_menu.clear_format",
		icon: UI.ICON.ERASER,
		warning: true,
	},
];

export function showStickyNoteContentMenu(args: ShowStickyNoteContentMenuArgs): boolean {
	const selectionRange = captureSelectionRange(args.editorEl);
	args.event.preventDefault();
	showContextMenuAtMouseEvent(
		args.event,
		CONTENT_MENU_ITEMS.map((item) => {
			if (isSeparatorOption(item)) {
				return {
					kind: "separator" as const,
				};
			}
			return {
				title: args.t(item.labelKey),
				icon: item.icon,
				warning: item.warning,
				onClick: () => {
					restoreSelectionRange(args.editorEl, selectionRange);
					args.onCommand(item.command);
				},
			};
		}),
	);
	return true;
}

function isSeparatorOption(item: StickyNoteContentMenuOption): item is StickyNoteContentMenuSeparator {
	return (item as StickyNoteContentMenuSeparator).kind === "separator";
}

function captureSelectionRange(editorEl: HTMLTextAreaElement): { start: number; end: number } {
	return {
		start: editorEl.selectionStart ?? 0,
		end: editorEl.selectionEnd ?? (editorEl.selectionStart ?? 0),
	};
}

function restoreSelectionRange(editorEl: HTMLTextAreaElement, range: { start: number; end: number }): void {
	editorEl.focus();
	editorEl.setSelectionRange(range.start, range.end);
}







