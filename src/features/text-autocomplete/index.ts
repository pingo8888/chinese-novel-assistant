import { Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { createPairPunctuationAutocompleteExtension } from "./providers/pair-punctuation";

export function registerTextAutocompleteFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new TextAutocompleteFeature(plugin, ctx);
	feature.onload();
}

class TextAutocompleteFeature {
	private plugin: Plugin;
	private ctx: PluginContext;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
	}

	onload(): void {
		this.plugin.registerEditorExtension(
			createPairPunctuationAutocompleteExtension(() => this.ctx.settings),
		);
	}
}

