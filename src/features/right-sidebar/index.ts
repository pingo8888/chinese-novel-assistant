import type { Plugin } from "obsidian";
import { IDS, UI } from "../../constants";
import type { PluginContext } from "../../core/context";
import { ChineseNovelAssistantRightSidebarView } from "../../ui/views/right-sidebar-view";

export function registerRightSidebarFeature(plugin: Plugin, ctx: PluginContext): void {
	const getTooltipText = () => ctx.t("feature.right_sidebar.tooltip");
	plugin.registerView(
		IDS.view.rightSidebar,
		(leaf) => new ChineseNovelAssistantRightSidebarView(leaf, getTooltipText, (key) => ctx.t(key)),
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
