import { MarkdownView, Notice, Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { fixEnPunctuationErrors } from "../text-detection/rules/en-punctuation";
import { fixPairPunctuationErrors } from "../text-detection/rules/pair-punctuation";

export function registerCommandsFeature(plugin: Plugin, ctx: PluginContext): void {
	registerTypesetCommands(plugin, ctx);
	registerProofreadCommands(plugin, ctx);
}

function registerTypesetCommands(_plugin: Plugin, _ctx: PluginContext): void {
	// Reserved for typeset-related commands.
}

function registerProofreadCommands(plugin: Plugin, ctx: PluginContext): void {
	plugin.addCommand({
		id: "fix-detected-punctuation-errors",
		name: ctx.t("command.proofread.fix_punctuation_errors.name"),
		callback: () => {
			const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				new Notice(ctx.t("command.proofread.fix_punctuation_errors.no_active_editor"));
				return;
			}

			const sourceText = activeView.editor.getValue();
			const enFixResult = fixEnPunctuationErrors(sourceText, ctx.settings);
			const pairFixResult = fixPairPunctuationErrors(enFixResult.text, ctx.settings);
			const fixedText = pairFixResult.text;
			const fixedCount = enFixResult.replacedCount + pairFixResult.replacedCount;

			if (fixedText === sourceText || fixedCount <= 0) {
				new Notice(ctx.t("command.proofread.fix_punctuation_errors.no_changes"));
				return;
			}

			const editor = activeView.editor;
			const cursorOffset = editor.posToOffset(editor.getCursor());
			editor.setValue(fixedText);
			const nextCursorOffset = Math.max(0, Math.min(cursorOffset, fixedText.length));
			editor.setCursor(editor.offsetToPos(nextCursorOffset));
			new Notice(`${ctx.t("command.proofread.fix_punctuation_errors.done")} ${fixedCount}`);
		},
	});
}
