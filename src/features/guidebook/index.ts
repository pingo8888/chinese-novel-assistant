import type { Plugin } from "obsidian";
import { IDS, UI } from "../../constants";
import type { PluginContext } from "../../core/context";
import { buildGuidebookTreeData } from "./tree-builder";
import { ChineseNovelAssistantGuidebookSidebarView } from "../../ui/views/guidebook-item-view";
import type { SidebarViewRenderContext } from "../../ui/views/guidebook";
import {
	detachStickyNoteSidebars,
	registerStickyNoteSidebarView,
	syncStickyNoteSidebarWithGuidebook,
} from "../sticky-note";

export function registerGuidebookSidebarFeature(plugin: Plugin, ctx: PluginContext): void {
	const getTooltipText = () => ctx.t("feature.right_sidebar.guidebook.tooltip");
	const renderContext: SidebarViewRenderContext = {
		app: plugin.app,
		t: (key) => ctx.t(key),
		getSettings: () => ctx.settings,
		setSettings: (patch) => ctx.setSettings(patch),
		onSettingsChange: (listener) => ctx.onSettingsChange(listener),
		loadGuidebookTreeData: (activeFilePath) =>
			buildGuidebookTreeData(plugin.app, {
				locale: ctx.settings.locale,
				novelLibraries: ctx.settings.novelLibraries,
				guidebookDirName: ctx.settings.guidebookDirName,
				guidebookCollectionOrders: ctx.settings.guidebookCollectionOrders,
			}, activeFilePath),
	};
	plugin.registerView(
		IDS.view.guidebookSidebar,
		(leaf) => new ChineseNovelAssistantGuidebookSidebarView(leaf, getTooltipText, renderContext),
	);
	registerStickyNoteSidebarView(plugin, renderContext);
	plugin.addRibbonIcon(UI.icon.plugin, getTooltipText(), () => {
		void openGuidebookSidebarWithStickyNote(plugin, ctx);
	});
	plugin.app.workspace.onLayoutReady(() => {
		void openGuidebookSidebarWithStickyNote(plugin, ctx, {
			focusGuidebook: false,
			revealGuidebook: false,
		});
	});

	plugin.register(() => {
		for (const leaf of plugin.app.workspace.getLeavesOfType(IDS.view.guidebookSidebar)) {
			leaf.detach();
		}
		detachStickyNoteSidebars(plugin);
	});
}

interface OpenGuidebookSidebarOptions {
	focusGuidebook?: boolean;
	revealGuidebook?: boolean;
}

async function openGuidebookSidebarWithStickyNote(
	plugin: Plugin,
	ctx: PluginContext,
	options?: OpenGuidebookSidebarOptions,
): Promise<void> {
	const focusGuidebook = options?.focusGuidebook ?? true;
	const revealGuidebook = options?.revealGuidebook ?? true;
	const guidebookLeaf = await plugin.app.workspace.ensureSideLeaf(IDS.view.guidebookSidebar, "right", {
		active: focusGuidebook,
		reveal: revealGuidebook,
		split: false,
	});

	await syncStickyNoteSidebarWithGuidebook(plugin, ctx, guidebookLeaf);

	plugin.app.workspace.setActiveLeaf(guidebookLeaf, false, focusGuidebook);
}
