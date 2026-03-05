import type { Plugin } from "obsidian";
import { IDS, UI } from "../../constants";
import type { PluginContext } from "../../core/context";
import { buildGuidebookTreeData } from "./guidebook-tree-builder";
import { ChineseNovelAssistantRightSidebarView } from "../../ui/views/right-sidebar-view";
import type { RightSidebarViewRenderContext } from "../../ui/views/right-sidebar-views";

export function registerRightSidebarFeature(plugin: Plugin, ctx: PluginContext): void {
	const getTooltipText = () => ctx.t("feature.right_sidebar.tooltip");
	const renderContext: RightSidebarViewRenderContext = {
		app: plugin.app,
		t: (key) => ctx.t(key),
		getSettings: () => ctx.settings,
		onSettingsChange: (listener) => ctx.onSettingsChange(listener),
		loadGuidebookTreeData: (activeFilePath) =>
			buildGuidebookTreeData(plugin.app, {
				locale: ctx.settings.locale,
				novelLibraries: ctx.settings.novelLibraries,
				guidebookDirName: ctx.settings.guidebookDirName,
			}, activeFilePath),
	};
	plugin.registerView(
		IDS.view.rightSidebar,
		(leaf) => new ChineseNovelAssistantRightSidebarView(leaf, getTooltipText, renderContext),
	);
	plugin.addRibbonIcon(UI.icon.plugin, getTooltipText(), () => {
		void openRightSidebar(plugin);
	});

	plugin.register(() => {
		for (const leaf of plugin.app.workspace.getLeavesOfType(IDS.view.rightSidebar)) {
			void leaf.setViewState({ type: "empty" });
		}
	});
}

async function openRightSidebar(plugin: Plugin): Promise<void> {
	await plugin.app.workspace.ensureSideLeaf(IDS.view.rightSidebar, "right", {
		active: true,
		reveal: true,
		split: false,
	});
}
