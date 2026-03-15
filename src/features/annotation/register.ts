import type { Plugin, WorkspaceLeaf } from "obsidian";
import { type PluginContext } from "../../core";
import { AnnotationSidebarView } from "./views/item-view";

export function registerAnnotationSidebarView(plugin: Plugin, ctx: PluginContext): void {
	plugin.registerView(
		"annotation-sidebar",
		(leaf) => new AnnotationSidebarView(leaf, ctx),
	);
}

export async function syncAnnotationSidebarWithGuidebook(
	plugin: Plugin,
	ctx: PluginContext,
	guidebookLeaf: WorkspaceLeaf,
): Promise<void> {
	if (ctx.settings.annotationEnabled) {
		const annotationLeaves = plugin.app.workspace.getLeavesOfType("annotation-sidebar");
		const hasAnnotationSibling = annotationLeaves.some((leaf) => leaf.parent === guidebookLeaf.parent);
		if (!hasAnnotationSibling) {
			for (const leaf of annotationLeaves) {
				leaf.detach();
			}
		}

		await plugin.app.workspace.ensureSideLeaf(
			"annotation-sidebar",
			"right",
			{
				active: false,
				reveal: false,
				split: false,
			},
		);
		return;
	}

	detachAnnotationSidebars(plugin);
}

export function detachAnnotationSidebars(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType("annotation-sidebar")) {
		leaf.detach();
	}
}

export async function openAnnotationSidebar(plugin: Plugin, focus: boolean): Promise<void> {
	const annotationLeaf = await plugin.app.workspace.ensureSideLeaf(
		"annotation-sidebar",
		"right",
		{
			active: focus,
			reveal: true,
			split: false,
		},
	);
	plugin.app.workspace.setActiveLeaf(annotationLeaf, {
		focus,
	});
}
