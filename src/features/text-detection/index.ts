import type { EditorView } from "@codemirror/view";
import { MarkdownView, Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { NovelLibraryService } from "../../services/novel-library-service";
import { createTextDetectionExtension } from "./engine";
import { createProofreadDictRules } from "./rules/proofread-dict";
import { createEnPunctuationRules } from "./rules/en-punctuation";
import { createPairPunctuationRules } from "./rules/pair-punctuation";
import { ProofreadDictService } from "../../services/proofread-dict-service";

export function registerTextDetectionFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new TextDetectionFeature(plugin, ctx);
	feature.onload();
}

class TextDetectionFeature {
	private plugin: Plugin;
	private ctx: PluginContext;
	private proofreadDictService: ProofreadDictService;
	private novelLibraryService: NovelLibraryService;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
		this.proofreadDictService = ProofreadDictService.getInstance(plugin.app);
		this.novelLibraryService = new NovelLibraryService(plugin.app);
	}

	onload(): void {
		this.proofreadDictService.bindVaultEvents(this.plugin, () => this.ctx.settings);

		this.plugin.registerEditorExtension(
			createTextDetectionExtension([
				...createEnPunctuationRules(() => this.ctx.settings, (view) => this.shouldDetectForEditor(view)),
				...createPairPunctuationRules(() => this.ctx.settings, (view) => this.shouldDetectForEditor(view)),
				...createProofreadDictRules(
					() => this.ctx.settings,
					() => this.proofreadDictService.getSnapshot(),
					(view) => this.shouldDetectForEditor(view),
				),
			]),
		);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.proofreadDictService.invalidate();
			void this.proofreadDictService.ensureCacheReady(this.ctx.settings);
			this.forceRefreshEditorViews();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});
		const unsubscribeCacheChanged = this.proofreadDictService.onCacheChanged(() => {
			this.forceRefreshEditorViews();
		});
		this.plugin.register(() => {
			unsubscribeCacheChanged();
		});

		void this.proofreadDictService.ensureCacheReady(this.ctx.settings);
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

	private shouldDetectForEditor(editorView: EditorView): boolean {
		const markdownView = this.resolveMarkdownViewByEditor(editorView);
		const filePath = markdownView?.file?.path;
		if (!filePath) {
			return true;
		}

		const normalizedFilePath = this.novelLibraryService.normalizeVaultPath(filePath);
		if (!normalizedFilePath) {
			return true;
		}

		const featureRoots = this.ctx.settings.novelLibraries
			.map((libraryPath) =>
				this.novelLibraryService.resolveNovelLibraryFeatureRootPath(
					{ locale: this.ctx.settings.locale },
					libraryPath,
				),
			)
			.filter((path) => path.length > 0);
		return !featureRoots.some((root) => this.isSameOrChildPath(normalizedFilePath, root));
	}

	private resolveMarkdownViewByEditor(editorView: EditorView): MarkdownView | null {
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				continue;
			}
			if (this.resolveEditorView(view) === editorView) {
				return view;
			}
		}
		return null;
	}

	private isSameOrChildPath(path: string, root: string): boolean {
		return path === root || path.startsWith(`${root}/`);
	}
}
