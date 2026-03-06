import type { EditorView } from "@codemirror/view";
import { MarkdownView, type Plugin } from "obsidian";
import { GuidebookMarkdownParser } from "../../guidebook/markdown-parser";
import { NovelLibraryService } from "../../../services/novel-library-service";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import { resolveMarkdownViewByEditorView } from "../../../utils/markdown-editor-view";
import type { TextDetectionRule } from "../engine";

const GUIDEBOOK_KEYWORD_HIT_CLASS = "cna-guidebook-keyword-hit";
const GUIDEBOOK_KEYWORD_BACKGROUND_VAR = "--cna-guidebook-keyword-background-color";
const GUIDEBOOK_KEYWORD_UNDERLINE_STYLE_VAR = "--cna-guidebook-keyword-underline-style";
const GUIDEBOOK_KEYWORD_UNDERLINE_WIDTH_VAR = "--cna-guidebook-keyword-underline-width";
const GUIDEBOOK_KEYWORD_UNDERLINE_COLOR_VAR = "--cna-guidebook-keyword-underline-color";
const GUIDEBOOK_KEYWORD_FONT_WEIGHT_VAR = "--cna-guidebook-keyword-font-weight";
const GUIDEBOOK_KEYWORD_FONT_STYLE_VAR = "--cna-guidebook-keyword-font-style";
const GUIDEBOOK_KEYWORD_TEXT_COLOR_VAR = "--cna-guidebook-keyword-text-color";

interface MatchRange {
	from: number;
	to: number;
}

export class GuidebookKeywordHighlightController {
	private readonly plugin: Plugin;
	private readonly getSettings: () => ChineseNovelAssistantSettings;
	private readonly shouldDetectInView: (view: EditorView) => boolean;
	private readonly forceRefreshEditorViews: () => void;
	private readonly novelLibraryService: NovelLibraryService;
	private readonly guidebookMarkdownParser: GuidebookMarkdownParser;
	private readonly guidebookKeywordsByLibraryRoot = new Map<string, readonly string[]>();
	private readonly loadingGuidebookKeywordRoots = new Set<string>();
	private guidebookKeywordRefreshTimer: number | null = null;
	private isDisposed = false;

	constructor(
		plugin: Plugin,
		getSettings: () => ChineseNovelAssistantSettings,
		shouldDetectInView: (view: EditorView) => boolean,
		forceRefreshEditorViews: () => void,
	) {
		this.plugin = plugin;
		this.getSettings = getSettings;
		this.shouldDetectInView = shouldDetectInView;
		this.forceRefreshEditorViews = forceRefreshEditorViews;
		this.novelLibraryService = new NovelLibraryService(plugin.app);
		this.guidebookMarkdownParser = new GuidebookMarkdownParser();
	}

	getRules(): TextDetectionRule[] {
		return createGuidebookKeywordRules(
			() => this.getSettings(),
			(view) => this.getGuidebookKeywordsByEditorView(view),
			(view) => this.shouldDetectInView(view),
		);
	}

	applyInitialState(): void {
		this.applyStyles();
		this.schedulePrefetchKeywords();
	}

	handleSettingsChange(): void {
		this.clearKeywordCache();
		this.schedulePrefetchKeywords();
		this.applyStyles();
	}

	handleFilePathHint(filePath?: string | null): void {
		this.schedulePrefetchKeywords(filePath ?? null);
	}

	handleVaultChange(path: string, oldPath?: string | null): boolean {
		if (!this.isGuidebookPath(path) && !this.isGuidebookPath(oldPath ?? null)) {
			return false;
		}
		this.clearKeywordCache();
		this.schedulePrefetchKeywords();
		return true;
	}

	dispose(): void {
		this.isDisposed = true;
		if (this.guidebookKeywordRefreshTimer !== null) {
			window.clearTimeout(this.guidebookKeywordRefreshTimer);
			this.guidebookKeywordRefreshTimer = null;
		}
		this.clearStyles();
		this.clearKeywordCache();
	}

	private getGuidebookKeywordsByEditorView(editorView: EditorView): readonly string[] {
		const markdownView = resolveMarkdownViewByEditorView(this.plugin.app, editorView);
		const filePath = markdownView?.file?.path ?? null;
		const libraryRoot = this.resolveContainingLibraryRoot(filePath);
		if (!libraryRoot) {
			return [];
		}

		const cached = this.guidebookKeywordsByLibraryRoot.get(libraryRoot);
		if (cached) {
			return cached;
		}

		void (async () => {
			const changed = await this.refreshKeywordsForLibrary(libraryRoot);
			if (changed) {
				this.forceRefreshEditorViews();
			}
		})();
		return [];
	}

	private schedulePrefetchKeywords(preferredFilePath?: string | null): void {
		if (this.isDisposed) {
			return;
		}
		if (this.guidebookKeywordRefreshTimer !== null) {
			window.clearTimeout(this.guidebookKeywordRefreshTimer);
		}
		this.guidebookKeywordRefreshTimer = window.setTimeout(() => {
			this.guidebookKeywordRefreshTimer = null;
			void this.prefetchKeywords(preferredFilePath ?? null);
		}, 120);
	}

	private async prefetchKeywords(preferredFilePath: string | null): Promise<void> {
		if (this.isDisposed) {
			return;
		}
		this.pruneKeywordCache();

		const filePaths = new Set<string>();
		if (preferredFilePath) {
			filePaths.add(preferredFilePath);
		}
		const activeFilePath = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
		if (activeFilePath) {
			filePaths.add(activeFilePath);
		}
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file?.path) {
				continue;
			}
			filePaths.add(view.file.path);
		}

		const refreshTasks: Promise<boolean>[] = [];
		for (const filePath of filePaths) {
			const libraryRoot = this.resolveContainingLibraryRoot(filePath);
			if (!libraryRoot) {
				continue;
			}
			refreshTasks.push(this.refreshKeywordsForLibrary(libraryRoot));
		}
		if (refreshTasks.length > 0) {
			const results = await Promise.all(refreshTasks);
			if (results.some((value) => value)) {
				this.forceRefreshEditorViews();
			}
		}
	}

	private async refreshKeywordsForLibrary(libraryRootPath: string): Promise<boolean> {
		if (!libraryRootPath || this.isDisposed || this.loadingGuidebookKeywordRoots.has(libraryRootPath)) {
			return false;
		}

		this.loadingGuidebookKeywordRoots.add(libraryRootPath);
		try {
			const keywords = await this.collectGuidebookH2Keywords(libraryRootPath);
			if (this.isDisposed) {
				return false;
			}
			const previousKeywords = this.guidebookKeywordsByLibraryRoot.get(libraryRootPath) ?? [];
			if (areKeywordListsEqual(previousKeywords, keywords)) {
				return false;
			}
			this.guidebookKeywordsByLibraryRoot.set(libraryRootPath, keywords);
			return true;
		} finally {
			this.loadingGuidebookKeywordRoots.delete(libraryRootPath);
		}
	}

	private async collectGuidebookH2Keywords(libraryRootPath: string): Promise<readonly string[]> {
		const settings = this.getSettings();
		const guidebookRootPath = this.novelLibraryService.resolveNovelLibrarySubdirPath(
			{ locale: settings.locale },
			libraryRootPath,
			settings.guidebookDirName,
		);
		if (!guidebookRootPath) {
			return [];
		}

		const guidebookMarkdownFiles = this.plugin.app.vault
			.getMarkdownFiles()
			.filter((file) => this.novelLibraryService.isSameOrChildPath(file.path, guidebookRootPath))
			.sort((left, right) => left.stat.ctime - right.stat.ctime || left.path.localeCompare(right.path));

		const keywordSet = new Set<string>();
		for (const file of guidebookMarkdownFiles) {
			const markdown = await this.plugin.app.vault.cachedRead(file);
			const h1List = this.guidebookMarkdownParser.parseTree(markdown);
			for (const h1Node of h1List) {
				for (const h2Node of h1Node.h2List) {
					const title = h2Node.title.trim();
					if (title.length === 0) {
						continue;
					}
					keywordSet.add(title);
				}
			}
		}

		return Array.from(keywordSet).sort((left, right) => right.length - left.length || left.localeCompare(right));
	}

	private clearKeywordCache(): void {
		this.guidebookKeywordsByLibraryRoot.clear();
		this.loadingGuidebookKeywordRoots.clear();
	}

	private pruneKeywordCache(): void {
		const validLibraryRoots = new Set(this.novelLibraryService.normalizeLibraryRoots(this.getSettings().novelLibraries));
		for (const libraryRoot of this.guidebookKeywordsByLibraryRoot.keys()) {
			if (!validLibraryRoots.has(libraryRoot)) {
				this.guidebookKeywordsByLibraryRoot.delete(libraryRoot);
			}
		}
	}

	private resolveContainingLibraryRoot(filePath: string | null): string | null {
		if (!filePath) {
			return null;
		}
		const settings = this.getSettings();
		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
		return this.novelLibraryService.resolveContainingLibraryRoot(filePath, normalizedLibraryRoots);
	}

	private isGuidebookPath(path: string | null): boolean {
		if (!path) {
			return false;
		}
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		if (!normalizedPath) {
			return false;
		}
		return this.resolveGuidebookRoots().some((root) => this.novelLibraryService.isSameOrChildPath(normalizedPath, root));
	}

	private resolveGuidebookRoots(): string[] {
		const settings = this.getSettings();
		return settings.novelLibraries
			.map((libraryPath) =>
				this.novelLibraryService.resolveNovelLibrarySubdirPath(
					{ locale: settings.locale },
					libraryPath,
					settings.guidebookDirName,
				),
			)
			.filter((path) => path.length > 0);
	}

	private applyStyles(): void {
		const rootEl = this.getRootEl();
		const settings = this.getSettings();
		rootEl.style.setProperty(
			GUIDEBOOK_KEYWORD_BACKGROUND_VAR,
			this.normalizeCssColor(settings.guidebookKeywordHighlightBackgroundColor, "transparent"),
		);
		rootEl.style.setProperty(GUIDEBOOK_KEYWORD_UNDERLINE_STYLE_VAR, settings.guidebookKeywordUnderlineStyle);
		rootEl.style.setProperty(
			GUIDEBOOK_KEYWORD_UNDERLINE_WIDTH_VAR,
			`${Math.max(0, Math.min(10, Math.round(settings.guidebookKeywordUnderlineWidth)))}px`,
		);
		rootEl.style.setProperty(
			GUIDEBOOK_KEYWORD_UNDERLINE_COLOR_VAR,
			this.normalizeCssColor(settings.guidebookKeywordUnderlineColor, "currentColor"),
		);
		rootEl.style.setProperty(GUIDEBOOK_KEYWORD_FONT_WEIGHT_VAR, settings.guidebookKeywordFontWeight);
		rootEl.style.setProperty(GUIDEBOOK_KEYWORD_FONT_STYLE_VAR, settings.guidebookKeywordFontStyle);
		rootEl.style.setProperty(
			GUIDEBOOK_KEYWORD_TEXT_COLOR_VAR,
			this.normalizeCssColor(settings.guidebookKeywordTextColor, "inherit"),
		);
	}

	private clearStyles(): void {
		const rootEl = this.getRootEl();
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_BACKGROUND_VAR);
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_UNDERLINE_STYLE_VAR);
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_UNDERLINE_WIDTH_VAR);
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_UNDERLINE_COLOR_VAR);
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_FONT_WEIGHT_VAR);
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_FONT_STYLE_VAR);
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_TEXT_COLOR_VAR);
	}

	private normalizeCssColor(value: string, fallback: string): string {
		const normalized = value.trim();
		return normalized.length > 0 ? normalized : fallback;
	}

	private getRootEl(): HTMLElement {
		const workspaceContainerEl = (this.plugin.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl;
		return workspaceContainerEl ?? document.body;
	}
}

export function createGuidebookKeywordRules(
	getSettings: () => ChineseNovelAssistantSettings,
	getKeywordsByView: (view: EditorView) => readonly string[],
	shouldDetectInView?: (view: EditorView) => boolean,
): TextDetectionRule[] {
	let cachedSourceKeywords: readonly string[] | null = null;
	let cachedNormalizedKeywords: readonly string[] = [];

	return [
		{
			className: GUIDEBOOK_KEYWORD_HIT_CLASS,
			isEnabled: (view) => {
				if (shouldDetectInView && !shouldDetectInView(view)) {
					return false;
				}
				return getNormalizedKeywordsByView(view).length > 0;
			},
			matchDocumentIndices: (docText, view) => {
				const settings = getSettings();
				const keywords = getNormalizedKeywordsByView(view);
				if (docText.length === 0 || keywords.length === 0) {
					return [];
				}

				const ranges =
					settings.guidebookKeywordHighlightMode === "all"
						? collectAllMatchRanges(docText, keywords)
						: collectFirstMatchRanges(docText, keywords);
				if (ranges.length === 0) {
					return [];
				}

				const hitIndices = new Set<number>();
				for (const range of ranges) {
					for (let index = range.from; index < range.to; index += 1) {
						hitIndices.add(index);
					}
				}
				return Array.from(hitIndices).sort((left, right) => left - right);
			},
		},
	];

	function getNormalizedKeywordsByView(view: EditorView): readonly string[] {
		const keywords = getKeywordsByView(view);
		if (keywords === cachedSourceKeywords) {
			return cachedNormalizedKeywords;
		}
		cachedSourceKeywords = keywords;
		cachedNormalizedKeywords = normalizeKeywords(keywords);
		return cachedNormalizedKeywords;
	}
}

function normalizeKeywords(keywords: readonly string[]): string[] {
	const deduped = new Set<string>();
	for (const keyword of keywords) {
		const normalized = keyword.trim();
		if (normalized.length === 0) {
			continue;
		}
		deduped.add(normalized);
	}
	return Array.from(deduped).sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function collectFirstMatchRanges(docText: string, keywords: readonly string[]): MatchRange[] {
	const ranges: MatchRange[] = [];
	for (const keyword of keywords) {
		const firstIndex = docText.indexOf(keyword);
		if (firstIndex < 0) {
			continue;
		}
		ranges.push({
			from: firstIndex,
			to: firstIndex + keyword.length,
		});
	}
	return ranges;
}

function collectAllMatchRanges(docText: string, keywords: readonly string[]): MatchRange[] {
	const ranges: MatchRange[] = [];
	for (const keyword of keywords) {
		let cursor = 0;
		while (cursor < docText.length) {
			const matchIndex = docText.indexOf(keyword, cursor);
			if (matchIndex < 0) {
				break;
			}
			ranges.push({
				from: matchIndex,
				to: matchIndex + keyword.length,
			});
			cursor = matchIndex + keyword.length;
		}
	}
	return ranges;
}

function areKeywordListsEqual(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let i = 0; i < left.length; i += 1) {
		if (left[i] !== right[i]) {
			return false;
		}
	}
	return true;
}
