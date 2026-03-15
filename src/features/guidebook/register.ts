import type { Plugin } from "obsidian";
import { type PluginContext } from "../../core";
import { GuidebookSidebarView } from "./views/item-view";

// 注册guidebook侧边栏视图函数
export function registerGuidebookSidebarView(
	plugin: Plugin,
	ctx: PluginContext,
): void {
	plugin.registerView(
		"guidebook-sidebar",
		(leaf) => new GuidebookSidebarView(leaf, ctx),
	);
}
