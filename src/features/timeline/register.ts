import type { Plugin, WorkspaceLeaf } from "obsidian";
import { type PluginContext } from "../../core";
import { TimelineSidebarView } from "./views/item-view";

export function registerTimelineSidebarView(plugin: Plugin, ctx: PluginContext): void {
	plugin.registerView(
		"timeline-sidebar",
		(leaf) => new TimelineSidebarView(leaf, ctx),
	);
}

export async function syncTimelineSidebarWithGuidebook(
	plugin: Plugin,
	ctx: PluginContext,
	_guidebookLeaf: WorkspaceLeaf,
): Promise<void> {
	if (ctx.settings.timelineEnabled) {
		const timelineLeaves = plugin.app.workspace.getLeavesOfType("timeline-sidebar");
		if (timelineLeaves.length > 0) {
			return;
		}

		await plugin.app.workspace.ensureSideLeaf(
			"timeline-sidebar",
			"right",
			{
				active: false,
				reveal: false,
				split: false,
			},
		);
		return;
	}

	detachTimelineSidebars(plugin);
}

export function detachTimelineSidebars(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType("timeline-sidebar")) {
		leaf.detach();
	}
}

export async function openTimelineSidebar(plugin: Plugin, focus: boolean): Promise<void> {
	const timelineLeaf = await plugin.app.workspace.ensureSideLeaf(
		"timeline-sidebar",
		"right",
		{
			active: focus,
			reveal: true,
			split: false,
		},
	);
	plugin.app.workspace.setActiveLeaf(timelineLeaf, {
		focus,
	});
}
