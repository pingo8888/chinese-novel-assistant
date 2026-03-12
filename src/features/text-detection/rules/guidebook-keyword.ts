import type { EditorView } from "@codemirror/view";
import { MarkdownView, TFile, type Plugin } from "obsidian";
import { GuidebookMarkdownParser } from "../../guidebook/markdown-parser";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../../services/novel-library-service";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import { resolveMarkdownViewByEditorView } from "../../../utils/markdown-editor-view";
import type { TextDetectionRange, TextDetectionRule } from "../engine";

const GUIDEBOOK_KEYWORD_HIT_CLASS = "cna-guidebook-keyword-hit";
const GUIDEBOOK_KEYWORD_BACKGROUND_VAR = "--cna-guidebook-keyword-background-color";
const GUIDEBOOK_KEYWORD_UNDERLINE_LINE_VAR = "--cna-guidebook-keyword-underline-line";
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

export interface GuidebookKeywordPreviewItem {
	keyword: string;
	title: string;
	categoryTitle: string;
	content: string;
	sourcePath: string;
}

interface GuidebookFileKeywordCacheEntry {
	mtime: number;
	size: number;
	keywords: readonly string[];
	previewsByKeyword: ReadonlyMap<string, GuidebookKeywordPreviewItem>;
}

interface GuidebookLibraryKeywordIndex {
	keywords: readonly string[];
	previewsByKeyword: ReadonlyMap<string, GuidebookKeywordPreviewItem>;
}

export class GuidebookKeywordHighlightController {
	private readonly plugin: Plugin;
	private readonly getSettings: () => ChineseNovelAssistantSettings;
	private readonly shouldDetectInView: (view: EditorView) => boolean;
	private readonly forceRefreshEditorViews: () => void;
	private readonly novelLibraryService: NovelLibraryService;
	private readonly guidebookMarkdownParser: GuidebookMarkdownParser;
	private readonly guidebookKeywordsByLibraryRoot = new Map<string, readonly string[]>();
	private readonly guidebookKeywordPreviewByLibraryRoot = new Map<string, ReadonlyMap<string, GuidebookKeywordPreviewItem>>();
	private readonly loadingGuidebookKeywordRoots = new Set<string>();
	private readonly dirtyGuidebookKeywordRoots = new Set<string>();
	private readonly guidebookFileKeywordCacheByPath = new Map<string, GuidebookFileKeywordCacheEntry>();
	private guidebookKeywordRefreshTimer: number | null = null;
	private keywordCacheVersion = 0;
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
		const affectedLibraryRoots = new Set<string>();
		const currentLibraryRoot = this.resolveContainingLibraryRoot(path);
		if (currentLibraryRoot) {
			affectedLibraryRoots.add(currentLibraryRoot);
		}
		const previousLibraryRoot = this.resolveContainingLibraryRoot(oldPath ?? null);
		if (previousLibraryRoot) {
			affectedLibraryRoots.add(previousLibraryRoot);
		}
		for (const libraryRoot of affectedLibraryRoots) {
			this.dirtyGuidebookKeywordRoots.add(libraryRoot);
		}
		this.schedulePrefetchKeywords(path);
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

	getPreviewItemByEditorView(editorView: EditorView, rawKeyword: string): GuidebookKeywordPreviewItem | null {
		if (!this.shouldDetectInView(editorView)) {
			return null;
		}
		const keyword = rawKeyword.trim();
		if (keyword.length === 0) {
			return null;
		}
		const markdownView = resolveMarkdownViewByEditorView(this.plugin.app, editorView);
		const filePath = markdownView?.file?.path ?? null;
		const libraryRoot = this.resolveContainingLibraryRoot(filePath);
		if (!libraryRoot) {
			return null;
		}
		const previewMap = this.guidebookKeywordPreviewByLibraryRoot.get(libraryRoot);
		if (previewMap) {
			return previewMap.get(keyword) ?? null;
		}
		void (async () => {
			const changed = await this.refreshKeywordsForLibrary(libraryRoot);
			if (changed) {
				this.forceRefreshEditorViews();
			}
		})();
		return null;
	}

	hasKeywordInEditorView(editorView: EditorView, rawKeyword: string): boolean {
		if (!this.shouldDetectInView(editorView)) {
			return false;
		}
		const keyword = rawKeyword.trim();
		if (keyword.length === 0) {
			return false;
		}
		const keywords = this.getGuidebookKeywordsByEditorView(editorView);
		return keywords.includes(keyword);
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

		const libraryRoots = new Set<string>();
		if (preferredFilePath) {
			const preferredLibraryRoot = this.resolveContainingLibraryRoot(preferredFilePath);
			if (preferredLibraryRoot) {
				libraryRoots.add(preferredLibraryRoot);
			}
		}
		const activeFilePath = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
		if (activeFilePath) {
			const activeLibraryRoot = this.resolveContainingLibraryRoot(activeFilePath);
			if (activeLibraryRoot) {
				libraryRoots.add(activeLibraryRoot);
			}
		}
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file?.path) {
				continue;
			}
			const libraryRoot = this.resolveContainingLibraryRoot(view.file.path);
			if (!libraryRoot) {
				continue;
			}
			libraryRoots.add(libraryRoot);
		}

		const refreshTasks: Promise<boolean>[] = [];
		for (const libraryRoot of libraryRoots) {
			const shouldRefresh =
				this.dirtyGuidebookKeywordRoots.has(libraryRoot) ||
				!this.guidebookKeywordsByLibraryRoot.has(libraryRoot);
			if (!shouldRefresh) {
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
		const cacheVersionAtStart = this.keywordCacheVersion;
		try {
			const keywordIndex = await this.collectGuidebookKeywordIndex(libraryRootPath);
			if (this.isDisposed || cacheVersionAtStart !== this.keywordCacheVersion) {
				return false;
			}
			const { keywords, previewsByKeyword } = keywordIndex;
			const previousKeywords = this.guidebookKeywordsByLibraryRoot.get(libraryRootPath) ?? [];
			this.guidebookKeywordPreviewByLibraryRoot.set(libraryRootPath, previewsByKeyword);
			if (areKeywordListsEqual(previousKeywords, keywords)) {
				this.dirtyGuidebookKeywordRoots.delete(libraryRootPath);
				return false;
			}
			this.guidebookKeywordsByLibraryRoot.set(libraryRootPath, keywords);
			this.dirtyGuidebookKeywordRoots.delete(libraryRootPath);
			return true;
		} finally {
			this.loadingGuidebookKeywordRoots.delete(libraryRootPath);
		}
	}

	private async collectGuidebookKeywordIndex(libraryRootPath: string): Promise<GuidebookLibraryKeywordIndex> {
		const settings = this.getSettings();
		const guidebookRootPath = this.novelLibraryService.resolveNovelLibrarySubdirPath(
			{ locale: settings.locale },
			libraryRootPath,
			NOVEL_LIBRARY_SUBDIR_NAMES.guidebook,
		);
		if (!guidebookRootPath) {
			return {
				keywords: [],
				previewsByKeyword: new Map(),
			};
		}

		const guidebookMarkdownFiles = this.plugin.app.vault
			.getMarkdownFiles()
			.filter((file) => this.novelLibraryService.isSameOrChildPath(file.path, guidebookRootPath))
			.sort((left, right) => left.stat.ctime - right.stat.ctime || left.path.localeCompare(right.path));

		const keywordSet = new Set<string>();
		const previewByKeyword = new Map<string, GuidebookKeywordPreviewItem>();
		const activeGuidebookPaths = new Set<string>();
		for (const file of guidebookMarkdownFiles) {
			activeGuidebookPaths.add(file.path);
			const fileKeywordIndex = await this.resolveGuidebookFileKeywordIndex(file.path, file.stat.mtime, file.stat.size);
			for (const title of fileKeywordIndex.keywords) {
				keywordSet.add(title);
			}
			for (const [keyword, previewItem] of fileKeywordIndex.previewsByKeyword) {
				if (!previewByKeyword.has(keyword)) {
					previewByKeyword.set(keyword, previewItem);
				}
			}
		}
		this.pruneGuidebookFileKeywordCache(guidebookRootPath, activeGuidebookPaths);

		return {
			keywords: Array.from(keywordSet).sort((left, right) => right.length - left.length || left.localeCompare(right)),
			previewsByKeyword: previewByKeyword,
		};
	}

	private clearKeywordCache(): void {
		this.keywordCacheVersion += 1;
		this.guidebookKeywordsByLibraryRoot.clear();
		this.guidebookKeywordPreviewByLibraryRoot.clear();
		this.loadingGuidebookKeywordRoots.clear();
		this.dirtyGuidebookKeywordRoots.clear();
		this.guidebookFileKeywordCacheByPath.clear();
	}

	private pruneKeywordCache(): void {
		const validLibraryRoots = new Set(this.novelLibraryService.normalizeLibraryRoots(this.getSettings().novelLibraries));
		for (const libraryRoot of this.guidebookKeywordsByLibraryRoot.keys()) {
			if (!validLibraryRoots.has(libraryRoot)) {
				this.guidebookKeywordsByLibraryRoot.delete(libraryRoot);
			}
		}
		for (const libraryRoot of this.guidebookKeywordPreviewByLibraryRoot.keys()) {
			if (!validLibraryRoots.has(libraryRoot)) {
				this.guidebookKeywordPreviewByLibraryRoot.delete(libraryRoot);
			}
		}
		for (const libraryRoot of this.dirtyGuidebookKeywordRoots) {
			if (!validLibraryRoots.has(libraryRoot)) {
				this.dirtyGuidebookKeywordRoots.delete(libraryRoot);
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
					NOVEL_LIBRARY_SUBDIR_NAMES.guidebook,
				),
			)
			.filter((path) => path.length > 0);
	}

	private applyStyles(): void {
		const rootEl = this.getRootEl();
		const settings = this.getSettings();
		const underlineEnabled = settings.guidebookKeywordUnderlineStyle !== "none";
		rootEl.style.setProperty(
			GUIDEBOOK_KEYWORD_BACKGROUND_VAR,
			this.normalizeCssColor(settings.guidebookKeywordHighlightBackgroundColor, "transparent"),
		);
		rootEl.style.setProperty(GUIDEBOOK_KEYWORD_UNDERLINE_LINE_VAR, underlineEnabled ? "underline" : "none");
		rootEl.style.setProperty(
			GUIDEBOOK_KEYWORD_UNDERLINE_STYLE_VAR,
			underlineEnabled ? settings.guidebookKeywordUnderlineStyle : "solid",
		);
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
		rootEl.style.removeProperty(GUIDEBOOK_KEYWORD_UNDERLINE_LINE_VAR);
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

	private async resolveGuidebookFileKeywordIndex(
		filePath: string,
		mtime: number,
		size: number,
	): Promise<GuidebookFileKeywordCacheEntry> {
		const cached = this.guidebookFileKeywordCacheByPath.get(filePath);
		if (cached && cached.mtime === mtime && cached.size === size) {
			return cached;
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return {
				mtime,
				size,
				keywords: [],
				previewsByKeyword: new Map(),
			};
		}
		const markdown = await this.plugin.app.vault.cachedRead(file);
		const h1List = this.guidebookMarkdownParser.parseTree(markdown);
		const keywordSet = new Set<string>();
		const previewsByKeyword = new Map<string, GuidebookKeywordPreviewItem>();
		for (const h1Node of h1List) {
			for (const h2Node of h1Node.h2List) {
				const keyword = h2Node.title.trim();
				if (keyword.length > 0) {
					keywordSet.add(keyword);
					if (!previewsByKeyword.has(keyword)) {
						previewsByKeyword.set(keyword, {
							keyword,
							title: h2Node.title,
							categoryTitle: h1Node.title,
							content: h2Node.content,
							sourcePath: filePath,
						});
					}
				}
			}
		}
		const keywords = Array.from(keywordSet).sort((left, right) => right.length - left.length || left.localeCompare(right));
		const nextEntry: GuidebookFileKeywordCacheEntry = {
			mtime,
			size,
			keywords,
			previewsByKeyword,
		};
		this.guidebookFileKeywordCacheByPath.set(filePath, nextEntry);
		return nextEntry;
	}

	private pruneGuidebookFileKeywordCache(guidebookRootPath: string, activeGuidebookPaths: Set<string>): void {
		for (const path of this.guidebookFileKeywordCacheByPath.keys()) {
			if (!this.novelLibraryService.isSameOrChildPath(path, guidebookRootPath)) {
				continue;
			}
			if (!activeGuidebookPaths.has(path)) {
				this.guidebookFileKeywordCacheByPath.delete(path);
			}
		}
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
			matchDocumentRanges: (docText, view): TextDetectionRange[] => {
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
				return ranges;
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
