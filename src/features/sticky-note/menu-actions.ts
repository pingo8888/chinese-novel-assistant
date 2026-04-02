import { applyRichTextCommand, type RichTextCommand } from "../../ui";

export type StickyNoteRichTextCommand = RichTextCommand;

export type StickyNoteCardMenuCommand =
	| { type: "set_color"; colorHex: string }
	| { type: "toggle_pin" }
	| { type: "delete" };

export type StickyNoteCardMenuActionResult = "updated" | "deleted" | "noop";

export interface StickyNoteCardMenuTarget {
	colorHex?: string;
	isPinned: boolean;
	updatedAt: number;
}

export function applyStickyNoteCardMenuCommand(
	command: StickyNoteCardMenuCommand,
	target: StickyNoteCardMenuTarget,
): StickyNoteCardMenuActionResult {
	switch (command.type) {
		case "set_color":
			if (target.colorHex === command.colorHex) {
				return "noop";
			}
			target.colorHex = command.colorHex;
			target.updatedAt = Date.now();
			return "updated";
		case "toggle_pin":
			target.isPinned = !target.isPinned;
			target.updatedAt = Date.now();
			return "updated";
		case "delete":
			return "deleted";
		default:
			return "noop";
	}
}

export function applyStickyNoteRichTextCommand(command: StickyNoteRichTextCommand, editorEl: HTMLTextAreaElement): void {
	applyRichTextCommand(command, editorEl);
}
