import { Notice, type Plugin, type Editor } from "obsidian";
import type { PluginContext } from "../../core/context";
import { ProofreadDictService } from "../text-detection/proofread-dict-provider";
import { fixEnPunctuationErrors } from "../text-detection/rules/en-punctuation";
import { fixPairPunctuationErrors } from "../text-detection/rules/pair-punctuation";
import { fixProofreadDictErrors } from "../text-detection/rules/proofread-dict";

export function registerProofreadCommands(plugin: Plugin, ctx: PluginContext): void {
	plugin.addCommand({
		id: "fix-detected-punctuation-errors",
		name: ctx.t("command.proofread.fix_punctuation_errors.name"),
		editorCheckCallback: (checking, editor) => {
			if (!ctx.settings.proofreadCommonPunctuationEnabled) {
				return false;
			}
			if (checking) {
				return true;
			}
			runFixPunctuationCommand(ctx, editor);
			return true;
		},
	});

	plugin.addCommand({
		id: "fix-detected-proofread-dict-errors",
		name: ctx.t("command.proofread.fix_proofread_dict_errors.name"),
		editorCheckCallback: (checking, editor) => {
			if (!ctx.settings.proofreadCustomDictionaryEnabled) {
				return false;
			}
			if (checking) {
				return true;
			}

			void runFixProofreadDictCommand(ctx, editor);
			return true;
		},
	});
}

function runFixPunctuationCommand(ctx: PluginContext, editor: Editor): void {
	const sourceText = editor.getValue();
	const enFixResult = fixEnPunctuationErrors(sourceText, ctx.settings);
	const pairFixResult = fixPairPunctuationErrors(enFixResult.text, ctx.settings);
	const fixedText = pairFixResult.text;
	const fixedCount = enFixResult.replacedCount + pairFixResult.replacedCount;

	if (fixedText === sourceText || fixedCount <= 0) {
		new Notice(ctx.t("command.proofread.fix_punctuation_errors.no_changes"));
		return;
	}

	const cursorOffset = editor.posToOffset(editor.getCursor());
	editor.setValue(fixedText);
	const nextCursorOffset = Math.max(0, Math.min(cursorOffset, fixedText.length));
	editor.setCursor(editor.offsetToPos(nextCursorOffset));
	new Notice(`${ctx.t("command.proofread.fix_punctuation_errors.done")} ${fixedCount}`);
}

async function runFixProofreadDictCommand(ctx: PluginContext, editor: Editor): Promise<void> {
	if (!ctx.settings.proofreadCustomDictionaryEnabled) {
		new Notice(ctx.t("command.proofread.fix_proofread_dict_errors.no_changes"));
		return;
	}

	const proofreadDictService = ProofreadDictService.getInstance(ctx.app);
	try {
		await proofreadDictService.ensureCacheReady(ctx.settings);
	} catch (error) {
		console.error("[Chinese Novel Assistant] Failed to rebuild proofread dictionary cache.", error);
		new Notice(ctx.t("command.proofread.fix_proofread_dict_errors.failed"));
		return;
	}

	const dictionary = proofreadDictService.getSnapshot();
	const sourceText = editor.getValue();
	const fixResult = fixProofreadDictErrors(sourceText, dictionary.replacements, dictionary.wrongWordsDesc);
	if (fixResult.replacedCount <= 0 || fixResult.text === sourceText) {
		new Notice(ctx.t("command.proofread.fix_proofread_dict_errors.no_changes"));
		return;
	}

	const cursorOffset = editor.posToOffset(editor.getCursor());
	editor.setValue(fixResult.text);
	const nextCursorOffset = Math.max(0, Math.min(cursorOffset, fixResult.text.length));
	editor.setCursor(editor.offsetToPos(nextCursorOffset));
	new Notice(`${ctx.t("command.proofread.fix_proofread_dict_errors.done")} ${fixResult.replacedCount}`);
}
