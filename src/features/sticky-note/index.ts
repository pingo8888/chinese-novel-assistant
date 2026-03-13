import type { Plugin, WorkspaceLeaf } from "obsidian";
import type { PluginContext } from "../../core/context";
import { StickyNoteSidebarView } from "../../ui/views/sticky-note/item-view";

export const STICKY_NOTE_FLOAT_DEFAULT_WIDTH = 292;
export const STICKY_NOTE_FLOAT_DEFAULT_HEIGHT = 119;
export const STICKY_NOTE_FLOAT_MIN_WIDTH = 220;
export const STICKY_NOTE_FLOAT_MIN_HEIGHT = 100;
export const STICKY_NOTE_FLOAT_LEFT_GAP = 14;
const STICKY_NOTE_FLOAT_BASE_ROWS = 6;
const STICKY_NOTE_FLOAT_HEIGHT_PER_ROW = STICKY_NOTE_FLOAT_DEFAULT_HEIGHT / STICKY_NOTE_FLOAT_BASE_ROWS;

export function resolveStickyNoteFloatDefaultHeightByRows(rows: number): number {
	const normalizedRows = Number.isFinite(rows) ? Math.max(1, Math.round(rows)) : STICKY_NOTE_FLOAT_BASE_ROWS;
	return Math.max(STICKY_NOTE_FLOAT_MIN_HEIGHT, Math.round(normalizedRows * STICKY_NOTE_FLOAT_HEIGHT_PER_ROW));
}

export function registerStickyNoteSidebarView(
	plugin: Plugin,
	ctx: PluginContext,
): void {
	plugin.registerView(
		"sticky-note-sidebar",
		(leaf) => new StickyNoteSidebarView(leaf, ctx),
	);
}

export async function syncStickyNoteSidebarWithGuidebook(
	plugin: Plugin,
	ctx: PluginContext,
	guidebookLeaf: WorkspaceLeaf,
): Promise<void> {
	if (ctx.settings.stickyNoteEnabled) {
		const stickyLeaves = plugin.app.workspace.getLeavesOfType("sticky-note-sidebar");
		const hasStickySibling = stickyLeaves.some((leaf) => leaf.parent === guidebookLeaf.parent);
		if (!hasStickySibling) {
			for (const leaf of stickyLeaves) {
				leaf.detach();
			}
		}

		await plugin.app.workspace.ensureSideLeaf("sticky-note-sidebar", "right", {
			active: false,
			reveal: false,
			split: false,
		});
		return;
	}

	detachStickyNoteSidebars(plugin);
}

export function detachStickyNoteSidebars(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType("sticky-note-sidebar")) {
		leaf.detach();
	}
}

export async function openStickyNoteSidebar(plugin: Plugin, focus: boolean): Promise<void> {
	const stickyNoteLeaf = await plugin.app.workspace.ensureSideLeaf(
		"sticky-note-sidebar",
		"right",
		{
			active: focus,
			reveal: true,
			split: false,
		},
	);
	plugin.app.workspace.setActiveLeaf(stickyNoteLeaf, {
		focus,
	});
}
