import { Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { createPairPunctuationAutocompleteExtension } from "./providers/pair-punctuation";
import { createSnippetTextFragmentAutocompleteExtension } from "./providers/text-fragment";
import { SnippetFragmentService } from "../../services/snippet-fragment-service";

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
		const snippetFragmentService = SnippetFragmentService.getInstance(this.plugin.app);
		snippetFragmentService.bindVaultEvents(this.plugin, () => this.ctx.settings);

		this.plugin.registerEditorExtension(
			createPairPunctuationAutocompleteExtension(() => this.ctx.settings),
		);
		this.plugin.registerEditorExtension(
			createSnippetTextFragmentAutocompleteExtension(this.plugin, () => this.ctx.settings),
		);
	}
}

