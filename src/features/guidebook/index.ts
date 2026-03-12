import type { Plugin } from "obsidian";
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
		"guidebook-sidebar",
		(leaf) => new GuidebookSidebarView(leaf, options.getTabTooltipText, options.renderContext),
	);
}
