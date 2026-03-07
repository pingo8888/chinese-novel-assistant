import type { TranslationKey } from "../../../lang";
import { showContextMenuAtMouseEvent } from "../../componets/context-menu";
import type { StickyNoteRichTextCommand } from "../../../features/sticky-note/menu-actions";

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
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.bold",
		icon: "bold",
	},
	{
		command: "italic",
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.italic",
		icon: "italic",
	},
	{
		command: "strikethrough",
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.strikethrough",
		icon: "strikethrough",
	},
	{
		command: "highlight",
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.highlight",
		icon: "highlighter",
	},
	{
		kind: "separator",
	},
	{
		command: "unordered",
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.unordered",
		icon: "list",
	},
	{
		command: "ordered",
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.ordered",
		icon: "list-ordered",
	},
	{
		kind: "separator",
	},
	{
		command: "clear_format",
		labelKey: "feature.right_sidebar.sticky_note.card.rich_menu.clear_format",
		icon: "eraser",
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
