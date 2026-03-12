import type { Plugin } from "obsidian";
import { UI } from "../../core/constants";
import type { PluginContext } from "../../core/context";
import { registerGuidebookSidebarView } from "../guidebook";
import {
	registerStickyNoteSidebarView,
	syncStickyNoteSidebarWithGuidebook,
} from "../sticky-note";
import { registerStickyNoteFloatingFeature } from "../sticky-note/floating-manager";

interface OpenGuidebookSidebarOptions {
	focusGuidebook?: boolean;
	revealGuidebook?: boolean;
}

export function registerSidebarFeature(plugin: Plugin, ctx: PluginContext): void {
	const getGuidebookTabTooltipText = () => ctx.t("feature.right_sidebar.guidebook.tab.tooltip");
	const getGuidebookRibbonTooltipText = () => ctx.t("feature.right_sidebar.guidebook.tooltip");

	registerGuidebookSidebarView(plugin, {
		getTabTooltipText: getGuidebookTabTooltipText,
		ctx,
	});
	registerStickyNoteSidebarView(plugin, ctx);
	registerStickyNoteFloatingFeature(plugin, ctx);

	plugin.addRibbonIcon(UI.ICON.PLUGIN, getGuidebookRibbonTooltipText(), () => {
		void openGuidebookSidebarWithStickyNote(plugin, ctx);
	});

	plugin.app.workspace.onLayoutReady(() => {
		void openGuidebookSidebarWithStickyNote(plugin, ctx, {
			focusGuidebook: false,
			revealGuidebook: false,
		});
	});
}

async function openGuidebookSidebarWithStickyNote(
	plugin: Plugin,
	ctx: PluginContext,
	options?: OpenGuidebookSidebarOptions,
): Promise<void> {
	const focusGuidebook = options?.focusGuidebook ?? true;
	const revealGuidebook = options?.revealGuidebook ?? true;
	const guidebookLeaf = await plugin.app.workspace.ensureSideLeaf(
		"guidebook-sidebar",
		"right",
		{
			active: focusGuidebook,
			reveal: revealGuidebook,
			split: false,
		},
	);

	await syncStickyNoteSidebarWithGuidebook(plugin, ctx, guidebookLeaf);
	plugin.app.workspace.setActiveLeaf(guidebookLeaf, {
		focus: focusGuidebook,
	});
}


