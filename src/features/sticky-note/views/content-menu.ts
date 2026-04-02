import type { TranslationKey } from "../../../lang";
import { showRichTextContentMenu } from "../../../ui";
import type { StickyNoteRichTextCommand } from "../menu-actions";

interface ShowStickyNoteContentMenuArgs {
	event: MouseEvent;
	editorEl: HTMLTextAreaElement;
	t: (key: TranslationKey) => string;
	onCommand: (command: StickyNoteRichTextCommand) => void;
}

export function showStickyNoteContentMenu(args: ShowStickyNoteContentMenuArgs): boolean {
	return showRichTextContentMenu(args);
}
