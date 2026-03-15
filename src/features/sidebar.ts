import type { Plugin } from "obsidian";
import { type PluginContext } from "../core";
import {
	detachStickyNoteSidebars,
	openStickyNoteSidebar,
	syncStickyNoteSidebarWithGuidebook,
} from "./sticky-note";

// 注册sidebar功能，用于处理两个视图的编排
export function registerSidebarFeature(plugin: Plugin, ctx: PluginContext): void {
	// 在布局准备好后，打开设定集侧边栏和便签侧边栏
	plugin.app.workspace.onLayoutReady(() => {
		void openGuidebookSidebarWithStickyNote(plugin, ctx);
	});

	let lastStickyNoteEnabled = ctx.settings.stickyNoteEnabled;
	const unsubscribeSettingsChange = ctx.onSettingsChange((settings) => {
		const nextStickyNoteEnabled = settings.stickyNoteEnabled;
		if (nextStickyNoteEnabled === lastStickyNoteEnabled) {
			return;
		}
		lastStickyNoteEnabled = nextStickyNoteEnabled;
		if (nextStickyNoteEnabled) {
			// 如果便签功能启用，则打开便签侧边栏
			void openStickyNoteSidebar(plugin, true);
			return;
		}
		detachStickyNoteSidebars(plugin);
		void openGuidebookSidebarWithStickyNote(plugin, ctx);
	});
	// 在设置发生变化时，更新便签侧边栏的状态
	plugin.register(unsubscribeSettingsChange);
	// 在插件卸载时，卸载侧边栏
	plugin.register(() => {
		detachSidebarViews(plugin);
	});
}

// 打开设定侧边栏和便签侧边栏
export async function openGuidebookSidebarWithStickyNote(
	plugin: Plugin,
	ctx: PluginContext,
): Promise<void> {
	const guidebookLeaf = await plugin.app.workspace.ensureSideLeaf(
		"guidebook-sidebar",
		"right",
		{
			active: true,
			reveal: true,
			split: false,
		},
	);

	await syncStickyNoteSidebarWithGuidebook(plugin, ctx, guidebookLeaf);
	plugin.app.workspace.setActiveLeaf(guidebookLeaf, {
		focus: true,
	});
}

function detachSidebarViews(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType("guidebook-sidebar")) {
		leaf.detach();
	}
	detachStickyNoteSidebars(plugin);
}

