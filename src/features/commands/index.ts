import { MarkdownView, Notice, Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { ProofreadDictService } from "../../services/proofread-dict-service";
import { fixProofreadDictErrors } from "../text-detection/rules/proofread-dict";
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
		checkCallback: (checking) => {
			if (!ctx.settings.proofreadCommonPunctuationEnabled) {
				return false;
			}
			if (checking) {
				return true;
			}

			const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				new Notice(ctx.t("command.proofread.fix_punctuation_errors.no_active_editor"));
				return true;
			}

			const sourceText = activeView.editor.getValue();
			const enFixResult = fixEnPunctuationErrors(sourceText, ctx.settings);
			const pairFixResult = fixPairPunctuationErrors(enFixResult.text, ctx.settings);
			const fixedText = pairFixResult.text;
			const fixedCount = enFixResult.replacedCount + pairFixResult.replacedCount;

			if (fixedText === sourceText || fixedCount <= 0) {
				new Notice(ctx.t("command.proofread.fix_punctuation_errors.no_changes"));
				return true;
			}

			const editor = activeView.editor;
			const cursorOffset = editor.posToOffset(editor.getCursor());
			editor.setValue(fixedText);
			const nextCursorOffset = Math.max(0, Math.min(cursorOffset, fixedText.length));
			editor.setCursor(editor.offsetToPos(nextCursorOffset));
			new Notice(`${ctx.t("command.proofread.fix_punctuation_errors.done")} ${fixedCount}`);
			return true;
		},
	});

	plugin.addCommand({
		id: "fix-detected-proofread-dict-errors",
		name: ctx.t("command.proofread.fix_proofread_dict_errors.name"),
		checkCallback: (checking) => {
			if (!ctx.settings.proofreadCustomDictionaryEnabled) {
				return false;
			}
			if (checking) {
				return true;
			}

			void runFixProofreadDictCommand(ctx);
			return true;
		},
	});
}

async function runFixProofreadDictCommand(ctx: PluginContext): Promise<void> {
	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		new Notice(ctx.t("command.proofread.fix_proofread_dict_errors.no_active_editor"));
		return;
	}
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
	const sourceText = activeView.editor.getValue();
	const fixResult = fixProofreadDictErrors(sourceText, dictionary.replacements, dictionary.wrongWordsDesc);
	if (fixResult.replacedCount <= 0 || fixResult.text === sourceText) {
		new Notice(ctx.t("command.proofread.fix_proofread_dict_errors.no_changes"));
		return;
	}

	const editor = activeView.editor;
	const cursorOffset = editor.posToOffset(editor.getCursor());
	editor.setValue(fixResult.text);
	const nextCursorOffset = Math.max(0, Math.min(cursorOffset, fixResult.text.length));
	editor.setCursor(editor.offsetToPos(nextCursorOffset));
	new Notice(`${ctx.t("command.proofread.fix_proofread_dict_errors.done")} ${fixResult.replacedCount}`);
}
