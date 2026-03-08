import type { EditorView } from "@codemirror/view";
import { MarkdownView, Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { NovelLibraryService } from "../../services/novel-library-service";
import { bindVaultChangeWatcher } from "../../services/vault-change-watcher";
import { createTextDetectionExtension, createTextDetectionForceRefreshTransaction } from "./engine";
import { createProofreadDictRules } from "./rules/proofread-dict";
import { createEnPunctuationRules } from "./rules/en-punctuation";
import { createPairPunctuationRules } from "./rules/pair-punctuation";
import { GuidebookKeywordHighlightController } from "./rules/guidebook-keyword";
import { ProofreadDictService } from "../../services/proofread-dict-service";
import { GuidebookPreviewController } from "../guidebook/preview-controller";
import { TextMenuGuidebookController } from "../guidebook/text-menu-controller";
import {
	resolveEditorViewFromMarkdownView,
	resolveMarkdownViewByEditorView,
} from "../../utils/markdown-editor-view";

export function registerTextDetectionFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new TextDetectionFeature(plugin, ctx);
	feature.onload();
}

class TextDetectionFeature {
	private plugin: Plugin;
	private ctx: PluginContext;
	private proofreadDictService: ProofreadDictService;
	private novelLibraryService: NovelLibraryService;
	private guidebookKeywordHighlightController: GuidebookKeywordHighlightController;
	private guidebookPreviewController: GuidebookPreviewController;
	private textMenuGuidebookController: TextMenuGuidebookController;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
		this.proofreadDictService = ProofreadDictService.getInstance(plugin.app);
		this.novelLibraryService = new NovelLibraryService(plugin.app);
		this.guidebookKeywordHighlightController = new GuidebookKeywordHighlightController(
			plugin,
			() => this.ctx.settings,
			(view) => this.shouldDetectForEditor(view),
			() => this.forceRefreshEditorViews(),
		);
		this.guidebookPreviewController = new GuidebookPreviewController(plugin, {
			getSettings: () => this.ctx.settings,
			resolveKeywordPreviewItem: (view, keyword) => this.guidebookKeywordHighlightController.getPreviewItemByEditorView(view, keyword),
			t: (key) => this.ctx.t(key),
		});
		this.textMenuGuidebookController = new TextMenuGuidebookController(plugin, {
			getSettings: () => this.ctx.settings,
			t: (key) => this.ctx.t(key),
			isGuidebookKeywordInEditor: (view, keyword) => this.guidebookKeywordHighlightController.hasKeywordInEditorView(view, keyword),
		});
	}

	onload(): void {
		this.proofreadDictService.bindVaultEvents(this.plugin, () => this.ctx.settings);

		this.plugin.registerEditorExtension(
			createTextDetectionExtension([
				...createEnPunctuationRules(() => this.ctx.settings, (view) => this.shouldDetectForEditor(view)),
				...createPairPunctuationRules(() => this.ctx.settings, (view) => this.shouldDetectForEditor(view)),
				...this.guidebookKeywordHighlightController.getRules(),
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
			this.guidebookKeywordHighlightController.handleSettingsChange();
			this.guidebookPreviewController.handleSettingsChange();
			this.textMenuGuidebookController.handleSettingsChange();
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

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", (file) => {
				this.guidebookKeywordHighlightController.handleFilePathHint(file?.path ?? null);
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
				const view = leaf?.view;
				if (!(view instanceof MarkdownView)) {
					return;
				}
				this.guidebookKeywordHighlightController.handleFilePathHint(view.file?.path ?? null);
			}),
		);
		bindVaultChangeWatcher(this.plugin, this.plugin.app, (event) => {
			this.guidebookKeywordHighlightController.handleVaultChange(event.path, event.oldPath ?? null);
			this.textMenuGuidebookController.handleVaultChange();
		});

		this.plugin.register(() => {
			this.guidebookKeywordHighlightController.dispose();
		});

		void this.proofreadDictService.ensureCacheReady(this.ctx.settings);
		this.guidebookKeywordHighlightController.applyInitialState();
		this.guidebookPreviewController.start();
		this.textMenuGuidebookController.start();
		this.plugin.register(() => {
			this.textMenuGuidebookController.dispose();
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

			const editorView = resolveEditorViewFromMarkdownView(view);
			editorView?.dispatch(createTextDetectionForceRefreshTransaction());
		}
	}

	private shouldDetectForEditor(editorView: EditorView): boolean {
		const markdownView = resolveMarkdownViewByEditorView(this.plugin.app, editorView);
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

	private isSameOrChildPath(path: string, root: string): boolean {
		return path === root || path.startsWith(`${root}/`);
	}
}
