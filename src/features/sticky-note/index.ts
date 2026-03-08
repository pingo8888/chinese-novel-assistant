import type { Plugin, WorkspaceLeaf } from "obsidian";
import { IDS } from "../../constants";
import type { PluginContext } from "../../core/context";
import type { SidebarViewRenderContext } from "../../ui/views/guidebook";
import { ChineseNovelAssistantStickyNoteSidebarView } from "../../ui/views/sticky-note-item-view";
import { registerStickyNoteFloatingFeature } from "./floating-manager";

export function registerStickyNoteSidebarView(
	plugin: Plugin,
	renderContext: SidebarViewRenderContext,
): void {
	plugin.registerView(
		IDS.view.stickyNoteSidebar,
		(leaf) => new ChineseNovelAssistantStickyNoteSidebarView(leaf, renderContext),
	);
}

export function registerStickyNoteFloatingWindows(plugin: Plugin, ctx: PluginContext): void {
	registerStickyNoteFloatingFeature(plugin, ctx);
}

export async function syncStickyNoteSidebarWithGuidebook(
	plugin: Plugin,
	ctx: PluginContext,
	guidebookLeaf: WorkspaceLeaf,
): Promise<void> {
	if (ctx.settings.stickyNoteEnabled) {
		const stickyLeaves = plugin.app.workspace.getLeavesOfType(IDS.view.stickyNoteSidebar);
		const hasStickySibling = stickyLeaves.some((leaf) => leaf.parent === guidebookLeaf.parent);
		if (!hasStickySibling) {
			for (const leaf of stickyLeaves) {
				leaf.detach();
			}
		}

		await plugin.app.workspace.ensureSideLeaf(IDS.view.stickyNoteSidebar, "right", {
			active: false,
			reveal: false,
			split: false,
		});
		return;
	}

	detachStickyNoteSidebars(plugin);
}

export function detachStickyNoteSidebars(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType(IDS.view.stickyNoteSidebar)) {
		leaf.detach();
	}
}
