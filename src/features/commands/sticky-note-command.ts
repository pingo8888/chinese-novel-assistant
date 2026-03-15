import { Notice, type Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../core/novel-library-service";
import {
	STICKY_NOTE_FLOAT_DEFAULT_HEIGHT,
	STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
	STICKY_NOTE_FLOAT_LEFT_GAP,
} from "../sticky-note";
import { StickyNoteRepository } from "../sticky-note/repository";

export function registerStickyNoteCommands(plugin: Plugin, ctx: PluginContext): void {
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

	const stickyRootPath = novelLibraryService.resolveNovelLibrarySubdirPath(targetLibraryRoot,
		NOVEL_LIBRARY_SUBDIR_NAMES.stickyNote,
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
		`.workspace-split.mod-right-split .workspace-leaf.mod-active .workspace-leaf-content[data-type="sticky-note-sidebar"] .cna-sticky-note-card-list .cna-sticky-note-card`;
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

