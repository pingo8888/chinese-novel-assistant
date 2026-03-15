import type { App } from "obsidian";
import { type PluginContext } from "../../../core";

export interface SettingsTabRenderContext {
	app: App;
	ctx: PluginContext;
	refresh: () => void;
}


