import type { Plugin, WorkspaceLeaf } from "obsidian";
import { type PluginContext } from "../../core";
import { StickyNoteSidebarView } from "./views/item-view";

// 浮动便签的初始参数
export const STICKY_NOTE_FLOAT_DEFAULT_WIDTH = 292;
export const STICKY_NOTE_FLOAT_DEFAULT_HEIGHT = 119;
export const STICKY_NOTE_FLOAT_MIN_WIDTH = 220;
export const STICKY_NOTE_FLOAT_MIN_HEIGHT = 100;
export const STICKY_NOTE_FLOAT_LEFT_GAP = 14;

// 注册sticky-note侧边栏视图函数
export function registerStickyNoteSidebarView(
	plugin: Plugin,
	ctx: PluginContext,
): void {
	plugin.registerView(
		"sticky-note-sidebar",
		(leaf) => new StickyNoteSidebarView(leaf, ctx),
	);
}

// 同步sticky-note侧边栏和guidebook侧边栏
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

		await plugin.app.workspace.ensureSideLeaf(
			"sticky-note-sidebar",
			"right",
			{
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



