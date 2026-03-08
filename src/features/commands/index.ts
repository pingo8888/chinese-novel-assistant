import { MarkdownView, Notice, Plugin } from "obsidian";
import { IDS, STICKY_NOTE_FLOAT_DEFAULT_HEIGHT, STICKY_NOTE_FLOAT_DEFAULT_WIDTH, STICKY_NOTE_FLOAT_LEFT_GAP } from "../../constants";
import type { PluginContext } from "../../core/context";
import { StickyNoteRepository } from "../sticky-note/repository";
import { NovelLibraryService } from "../../services/novel-library-service";
import { ProofreadDictService } from "../../services/proofread-dict-service";
import { fixProofreadDictErrors } from "../text-detection/rules/proofread-dict";
import { fixEnPunctuationErrors } from "../text-detection/rules/en-punctuation";
import { fixPairPunctuationErrors } from "../text-detection/rules/pair-punctuation";

export function registerCommandsFeature(plugin: Plugin, ctx: PluginContext): void {
	registerTypesetCommands(plugin, ctx);
	registerProofreadCommands(plugin, ctx);
	registerStickyNoteCommands(plugin, ctx);
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

function registerStickyNoteCommands(plugin: Plugin, ctx: PluginContext): void {
	const repository = new StickyNoteRepository(ctx.app);
	const novelLibraryService = new NovelLibraryService(ctx.app);

	plugin.addCommand({
		id: "create-sticky-note",
		name: ctx.t("command.sticky_note.create.name"),
		checkCallback: (checking) => {
			if (!ctx.settings.stickyNoteEnabled) {
				return false;
			}
			if (checking) {
				return true;
			}
			void runCreateStickyNoteCommand(ctx, repository, novelLibraryService);
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

async function runCreateStickyNoteCommand(
	ctx: PluginContext,
	repository: StickyNoteRepository,
	novelLibraryService: NovelLibraryService,
): Promise<void> {
	const stickyRootPath = resolveTargetStickyNoteRootPath(ctx, novelLibraryService);
	if (!stickyRootPath) {
		new Notice(ctx.t("command.sticky_note.create.no_library"));
		return;
	}

	try {
		const width = STICKY_NOTE_FLOAT_DEFAULT_WIDTH;
		const contentHeight = STICKY_NOTE_FLOAT_DEFAULT_HEIGHT;
		const position = resolveCommandCreatedFloatingPosition(width);
		const file = await repository.createCardFile(stickyRootPath, {
			isFloating: true,
			floatX: position.x,
			floatY: position.y,
			floatW: width,
			floatH: contentHeight,
		});
		new Notice(`${ctx.t("command.sticky_note.create.done")} ${file.basename}`);
	} catch (error) {
		console.error("[Chinese Novel Assistant] Failed to create sticky note.", error);
		new Notice(ctx.t("command.sticky_note.create.failed"));
	}
}

function resolveTargetStickyNoteRootPath(ctx: PluginContext, novelLibraryService: NovelLibraryService): string | null {
	const normalizedLibraryRoots = novelLibraryService.normalizeLibraryRoots(ctx.settings.novelLibraries);
	if (normalizedLibraryRoots.length === 0) {
		return null;
	}

	const activeFilePath = ctx.app.workspace.getActiveFile()?.path ?? "";
	const activeLibraryRoot = activeFilePath
		? novelLibraryService.resolveContainingLibraryRoot(activeFilePath, normalizedLibraryRoots)
		: null;
	const targetLibraryRoot = activeLibraryRoot ?? normalizedLibraryRoots[0] ?? "";
	if (!targetLibraryRoot) {
		return null;
	}

	const stickyRootPath = novelLibraryService.resolveNovelLibrarySubdirPath(
		ctx.settings,
		targetLibraryRoot,
		ctx.settings.stickyNoteDirName,
	);
	const normalizedStickyRootPath = novelLibraryService.normalizeVaultPath(stickyRootPath);
	return normalizedStickyRootPath.length > 0 ? normalizedStickyRootPath : null;
}

function resolveCommandCreatedFloatingPosition(width: number): { x: number; y: number } {
	const firstCardRect = queryStickySidebarFirstCardRect();
	if (firstCardRect) {
		return {
			x: Math.max(0, Math.round(firstCardRect.left - width - STICKY_NOTE_FLOAT_LEFT_GAP)),
			y: Math.max(0, Math.round(firstCardRect.top)),
		};
	}

	const rightSplitRect = queryRightSplitRect();
	if (rightSplitRect) {
		return {
			x: Math.max(0, Math.round(rightSplitRect.left - width - STICKY_NOTE_FLOAT_LEFT_GAP)),
			y: Math.max(0, Math.round(rightSplitRect.top + 72)),
		};
	}

	return {
		x: Math.max(0, Math.round(window.innerWidth - width - 24)),
		y: 120,
	};
}

function queryStickySidebarFirstCardRect(): DOMRect | null {
	const selector =
		`.workspace-split.mod-right-split .workspace-leaf.mod-active .workspace-leaf-content[data-type="${IDS.view.stickyNoteSidebar}"] .cna-sticky-note-card-list .cna-sticky-note-card`;
	const cardEl = document.querySelector<HTMLElement>(selector);
	if (!cardEl) {
		return null;
	}
	return cardEl.getBoundingClientRect();
}

function queryRightSplitRect(): DOMRect | null {
	const rightSplitEl = document.querySelector<HTMLElement>(".workspace-split.mod-right-split");
	if (!rightSplitEl) {
		return null;
	}
	return rightSplitEl.getBoundingClientRect();
}
