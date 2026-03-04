import type { EditorView } from "@codemirror/view";
import { MarkdownView, Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { createTextDetectionExtension } from "./engine";
import { createEnPunctuationRules } from "./rules/en-punctuation";
import { createPairPunctuationRules } from "./rules/pair-punctuation";

export function registerTextDetectionFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new TextDetectionFeature(plugin, ctx);
	feature.onload();
}

class TextDetectionFeature {
	private plugin: Plugin;
	private ctx: PluginContext;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
	}

	onload(): void {
		this.plugin.registerEditorExtension(
			createTextDetectionExtension([
				...createEnPunctuationRules(() => this.ctx.settings),
				...createPairPunctuationRules(() => this.ctx.settings),
			]),
		);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.forceRefreshEditorViews();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});

		this.forceRefreshEditorViews();
	}

	private forceRefreshEditorViews(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				continue;
			}

			const editorView = this.resolveEditorView(view);
			editorView?.dispatch({});
		}
	}

	private resolveEditorView(view: MarkdownView): EditorView | null {
		const cmHost = view as unknown as {
			editor?: {
				cm?: EditorView;
				editor?: { cm?: EditorView };
			};
			sourceMode?: {
				cmEditor?: {
					cm?: EditorView;
					editor?: { cm?: EditorView };
				};
			};
		};
		return (
			cmHost.editor?.cm ??
			cmHost.editor?.editor?.cm ??
			cmHost.sourceMode?.cmEditor?.cm ??
			cmHost.sourceMode?.cmEditor?.editor?.cm ??
			null
		);
	}
}
