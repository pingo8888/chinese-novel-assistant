import type { Plugin } from "obsidian";
import { IDS, UI } from "../../constants";
import type { PluginContext } from "../../core/context";
import { buildGuidebookTreeData } from "./guidebook-tree-builder";
import {
	ChineseNovelAssistantGuidebookSidebarView,
	ChineseNovelAssistantStickyNoteSidebarView,
} from "../../ui/views/right-sidebar-view";
import type { RightSidebarViewRenderContext } from "../../ui/views/right-sidebar-views";

export function registerRightSidebarViewsFeature(plugin: Plugin, ctx: PluginContext): void {
	const getTooltipText = () => ctx.t("feature.right_sidebar.guidebook.tooltip");
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
		IDS.view.guidebookSidebar,
		(leaf) => new ChineseNovelAssistantGuidebookSidebarView(leaf, getTooltipText, renderContext),
	);
	plugin.registerView(
		IDS.view.stickyNoteSidebar,
		(leaf) => new ChineseNovelAssistantStickyNoteSidebarView(leaf, renderContext),
	);
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
		for (const leaf of plugin.app.workspace.getLeavesOfType(IDS.view.stickyNoteSidebar)) {
			leaf.detach();
		}
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
	} else {
		for (const leaf of plugin.app.workspace.getLeavesOfType(IDS.view.stickyNoteSidebar)) {
			leaf.detach();
		}
	}

	plugin.app.workspace.setActiveLeaf(guidebookLeaf, false, focusGuidebook);
}
