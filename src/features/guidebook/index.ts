import type { Plugin } from "obsidian";
import { IDS } from "../../constants";
import { GuidebookSidebarView } from "../../ui/views/guidebook/item-view";
import type { SidebarViewRenderContext } from "../../ui/views/sidebar/types";

interface RegisterGuidebookSidebarViewOptions {
	getTabTooltipText: () => string;
	renderContext: SidebarViewRenderContext;
}

export function registerGuidebookSidebarView(
	plugin: Plugin,
	options: RegisterGuidebookSidebarViewOptions,
): void {
	plugin.registerView(
		IDS.view.guidebookSidebar,
		(leaf) => new GuidebookSidebarView(leaf, options.getTabTooltipText, options.renderContext),
	);
}

export function detachGuidebookSidebars(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType(IDS.view.guidebookSidebar)) {
		leaf.detach();
	}
}
