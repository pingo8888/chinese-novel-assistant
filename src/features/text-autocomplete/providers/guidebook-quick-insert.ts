import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Plugin } from "obsidian";
import type { SettingDatas } from "../../../core/setting-datas";
import { NovelLibraryService } from "../../../core/novel-library-service";
import { resolveMarkdownViewByEditorView } from "../../../utils/markdown-editor-view";
import {
	createSharedAutocompleteExtension,
	resolveLineSuffixTriggerMatch,
} from "./shared-autocomplete";
import {
	GuidebookQuickInsertService,
	type GuidebookQuickInsertCandidate,
} from "../../guidebook/quick-insert-keywords";

interface GuidebookQuickInsertContext {
	filePath: string;
}

export function createGuidebookQuickInsertExt(
	plugin: Plugin,
	getSettings: () => SettingDatas,
	guidebookQuickInsertService: GuidebookQuickInsertService,
): Extension {
	const novelLibraryService = new NovelLibraryService(plugin.app);

	return createSharedAutocompleteExtension<GuidebookQuickInsertCandidate, GuidebookQuickInsertContext>({
		getSettings,
		isEnabled: (settings) => settings.snippetQuickInsertEnabled,
		resolveTriggerMatch: (view) => resolveLineSuffixTriggerMatch(view, /\/\/([^\s/]+)$/),
		isMatchAllowed: (match) => containsCjk(match.query),
		resolveContext: (view, settings) => {
			const filePath = resolveActiveFilePath(plugin, view);
			if (!filePath) {
				return null;
			}
			if (isInsideFeatureRoot(filePath, settings, novelLibraryService)) {
				return null;
			}
			return { filePath };
		},
		queryCandidates: ({ settings, match, context }) =>
			guidebookQuickInsertService.queryGuidebookCandidates({
				settings,
				filePath: context.filePath,
				query: match.query,
			}),
		getItemKey: (item, index) => `${item.keyword}-${index}`,
		getItemLabel: (item) => item.keyword,
		resolveInsertion: (item) => ({
			insertText: item.keyword,
			cursorOffset: item.keyword.length,
		}),
		emptyTextKey: "feature.snippet.quick_insert.candidate.empty",
	});
}

function resolveActiveFilePath(plugin: Plugin, view: EditorView): string | null {
	const markdownView = resolveMarkdownViewByEditorView(plugin.app, view);
	return markdownView?.file?.path ?? null;
}

function isInsideFeatureRoot(
	filePath: string,
	settings: Pick<SettingDatas, "locale" | "novelLibraries">,
	novelLibraryService: NovelLibraryService,
): boolean {
	const normalizedFilePath = novelLibraryService.normalizeVaultPath(filePath);
	if (!normalizedFilePath) {
		return false;
	}
	const normalizedLibraries = settings.novelLibraries
		.map((path) => novelLibraryService.normalizeVaultPath(path))
		.filter((path) => path.length > 0)
		.sort((left, right) => right.length - left.length);
	for (const libraryPath of normalizedLibraries) {
		if (!novelLibraryService.isSameOrChildPath(normalizedFilePath, libraryPath)) {
			continue;
		}
		const featureRoot = novelLibraryService.resolveNovelLibraryFeatureRootPath(
			{ locale: settings.locale },
			libraryPath,
		);
		if (featureRoot && novelLibraryService.isSameOrChildPath(normalizedFilePath, featureRoot)) {
			return true;
		}
	}
	return false;
}

function containsCjk(value: string): boolean {
	return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(value);
}
