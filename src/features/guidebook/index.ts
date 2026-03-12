import type { Plugin } from "obsidian";
import { GuidebookSidebarView } from "../../ui/views/guidebook/item-view";
import type { PluginContext } from "../../core/context";

interface RegisterGuidebookSidebarViewOptions {
	getTabTooltipText: () => string;
	ctx: PluginContext;
}

export function registerGuidebookSidebarView(
	plugin: Plugin,
	options: RegisterGuidebookSidebarViewOptions,
): void {
	plugin.registerView(
		"guidebook-sidebar",
		(leaf) => new GuidebookSidebarView(leaf, options.getTabTooltipText, options.ctx),
	);
}
