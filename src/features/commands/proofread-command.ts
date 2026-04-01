import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { MarkdownView, Notice, type Plugin, type Editor } from "obsidian";
import { type PluginContext } from "../../core";
import {
	ProofreadDictService,
	collectPunctuationIgnoredRanges,
	fixEnPunctuationErrors,
	fixPairPunctuationErrors,
	fixProofreadDictErrors,
} from "../text-detection";
import { clamp, resolveEditorViewFromMarkdownView } from "../../utils";

type MaybeEditorView = ReturnType<typeof EditorView.findFromDOM>;
type ResolvedEditorView = NonNullable<MaybeEditorView>;

interface ViewportSnapshot {
	topLineNumber: number;
	topLineOffset: number;
	scrollLeft: number;
}

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
	const ignoredRanges = collectPunctuationIgnoredRanges(sourceText);
	const enFixResult = fixEnPunctuationErrors(sourceText, ctx.settings, ignoredRanges);
	const pairFixResult = fixPairPunctuationErrors(enFixResult.text, ctx.settings, ignoredRanges);
	const fixedText = pairFixResult.text;
	const fixedCount = enFixResult.replacedCount + pairFixResult.replacedCount;

	if (fixedText === sourceText || fixedCount <= 0) {
		new Notice(ctx.t("command.proofread.fix_punctuation_errors.no_changes"));
		return;
	}

	applyFixedTextPreservingViewport(ctx, editor, fixedText);
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

	applyFixedTextPreservingViewport(ctx, editor, fixResult.text);
	new Notice(`${ctx.t("command.proofread.fix_proofread_dict_errors.done")} ${fixResult.replacedCount}`);
}

function applyFixedTextPreservingViewport(ctx: PluginContext, editor: Editor, nextText: string): void {
	const cursorOffset = editor.posToOffset(editor.getCursor());
	const nextCursorOffset = clamp(cursorOffset, 0, nextText.length);
	const editorView = resolveEditorViewByEditor(editor) ?? resolveActiveEditorView(ctx);
	const restoreScroll = captureViewportRestore(editorView);

	if (editorView) {
		editorView.dispatch({
			changes: {
				from: 0,
				to: editorView.state.doc.length,
				insert: nextText,
			},
			selection: EditorSelection.cursor(nextCursorOffset),
			scrollIntoView: false,
		});
		restoreScroll();
		return;
	}

	editor.setValue(nextText);
	editor.setCursor(editor.offsetToPos(nextCursorOffset));
	restoreScroll();
}

function resolveEditorViewByEditor(editor: Editor): MaybeEditorView {
	const editorAny = editor as unknown as {
		cm?: ResolvedEditorView;
		editor?: { cm?: ResolvedEditorView };
	};
	return editorAny.cm ?? editorAny.editor?.cm ?? null;
}

function resolveActiveEditorView(ctx: PluginContext): MaybeEditorView {
	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		return null;
	}
	return resolveEditorViewFromMarkdownView(activeView);
}

function captureViewportRestore(editorView: MaybeEditorView): () => void {
	if (!editorView || !(editorView.scrollDOM instanceof HTMLElement)) {
		return () => undefined;
	}

	const scrollDom = editorView.scrollDOM;
	const topLineBlock = editorView.lineBlockAtHeight(scrollDom.scrollTop);
	const topLineNumber = editorView.state.doc.lineAt(topLineBlock.from).number;
	const topLineOffset = Math.max(0, scrollDom.scrollTop - topLineBlock.top);
	const scrollLeft = scrollDom.scrollLeft;
	const snapshot: ViewportSnapshot = {
		topLineNumber,
		topLineOffset,
		scrollLeft,
	};

	return () => {
		restoreViewportByLine(editorView, snapshot);
		window.requestAnimationFrame(() => {
			restoreViewportByLine(editorView, snapshot);
			window.requestAnimationFrame(() => {
				restoreViewportByLine(editorView, snapshot);
			});
		});
	};
}

function restoreViewportByLine(editorView: MaybeEditorView, snapshot: ViewportSnapshot): void {
	if (!editorView || !(editorView.scrollDOM instanceof HTMLElement)) {
		return;
	}
	const lineCount = editorView.state.doc.lines;
	if (lineCount <= 0) {
		return;
	}
	const targetLineNumber = clamp(snapshot.topLineNumber, 1, lineCount);
	const targetLineFrom = editorView.state.doc.line(targetLineNumber).from;
	const targetLineBlock = editorView.lineBlockAt(targetLineFrom);
	editorView.scrollDOM.scrollTop = Math.max(0, targetLineBlock.top + snapshot.topLineOffset);
	editorView.scrollDOM.scrollLeft = snapshot.scrollLeft;
}
