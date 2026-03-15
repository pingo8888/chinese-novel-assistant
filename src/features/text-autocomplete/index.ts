import { Plugin } from "obsidian";
import { type PluginContext } from "../../core";
import { createPairPunctuationAutocompleteExtension } from "./providers/pair-punctuation";
import { createTextFragmentAutocompleteExt } from "./providers/text-fragment";
import { createGuidebookQuickInsertExt } from "./providers/guidebook-quick-insert";
import { SnippetFragmentService } from "./text-fragment-parser";
import { GuidebookQuickInsertService } from "../guidebook/quick-insert-keywords";

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
		const guidebookQuickInsertService = GuidebookQuickInsertService.getInstance(this.plugin.app);
		snippetFragmentService.bindVaultEvents(this.plugin, () => this.ctx.settings);
		guidebookQuickInsertService.bindVaultEvents(this.plugin, () => this.ctx.settings);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			snippetFragmentService.invalidateAll();
			guidebookQuickInsertService.invalidateAll();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});

		this.plugin.registerEditorExtension(
			createPairPunctuationAutocompleteExtension(() => this.ctx.settings),
		);
		this.plugin.registerEditorExtension(
			createGuidebookQuickInsertExt(
				this.plugin,
				() => this.ctx.settings,
				guidebookQuickInsertService,
			),
		);
		this.plugin.registerEditorExtension(
			createTextFragmentAutocompleteExt(this.plugin, () => this.ctx.settings),
		);
	}
}





