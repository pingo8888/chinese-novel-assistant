import type { App } from "obsidian";
import type { PluginContext } from "../../../core/context";

export interface SettingsTabRenderContext {
	app: App;
	ctx: PluginContext;
	refresh: () => void;
}

