import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { type Plugin } from "obsidian";
import type { SettingDatas } from "../../../core/setting-datas";
import { NovelLibraryService } from "../../../core/novel-library-service";
import { resolveMarkdownViewByEditorView } from "../../../utils/markdown-editor-view";
import {
	createSharedAutocompleteExtension,
	resolveLineSuffixTriggerMatch,
} from "./shared-autocomplete";
import { SnippetFragmentService, type SnippetFragment } from "../text-fragment-parser";

interface FileContext {
	libraryPath: string;
}

const CURSOR_PLACEHOLDER = "{$cursor}";

export function createSnippetTextFragmentAutocompleteExtension(
	plugin: Plugin,
	getSettings: () => SettingDatas,
): Extension {
	const snippetFragmentService = SnippetFragmentService.getInstance(plugin.app);
	const novelLibraryService = new NovelLibraryService(plugin.app);

	return createSharedAutocompleteExtension<SnippetFragment, FileContext>({
		getSettings,
		isEnabled: (settings) => settings.snippetTextFragmentEnabled,
		resolveTriggerMatch: (view) => resolveLineSuffixTriggerMatch(view, /\/\/([A-Za-z0-9]+)$/),
		resolveContext: (view, settings) =>
			resolveFileContext(plugin, view, settings, novelLibraryService),
		queryCandidates: ({ settings, match, context }) =>
			snippetFragmentService.querySnippetFragments({
				settings,
				libraryPath: context.libraryPath,
				query: match.query,
			}),
		getItemKey: (item, index) => `${item.keyword}-${index}`,
		getItemLabel: (item) => item.content,
		resolveInsertion: (item) => resolveInsertion(item.content),
		emptyTextKey: "feature.snippet.candidate.empty",
	});
}

function resolveFileContext(
	plugin: Plugin,
	view: EditorView,
	settings: Pick<SettingDatas, "locale" | "novelLibraries">,
	novelLibraryService: NovelLibraryService,
): FileContext | null {
	const markdownView = resolveMarkdownViewByEditorView(plugin.app, view);
	const filePath = markdownView?.file?.path ?? "";
	if (!filePath) {
		return null;
	}

	const normalizedFilePath = novelLibraryService.normalizeVaultPath(filePath);
	if (!normalizedFilePath) {
		return null;
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
			return null;
		}
		return {
			libraryPath,
		};
	}
	return null;
}

function resolveInsertion(content: string): { insertText: string; cursorOffset: number } {
	const firstPlaceholderIndex = content.indexOf(CURSOR_PLACEHOLDER);
	if (firstPlaceholderIndex < 0) {
		return {
			insertText: content,
			cursorOffset: content.length,
		};
	}

	return {
		insertText: content.split(CURSOR_PLACEHOLDER).join(""),
		cursorOffset: firstPlaceholderIndex,
	};
}
