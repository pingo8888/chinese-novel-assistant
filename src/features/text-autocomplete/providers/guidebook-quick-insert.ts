import type { Extension } from "@codemirror/state";
import type { Plugin } from "obsidian";

import { type SettingDatas, NovelLibraryService } from "../../../core";
import { createSharedAutocompleteExt, resolveLineSuffixTriggerMatch } from "./shared-autocomplete";
import { GuidebookQuickInsertService, type GuidebookQuickInsertCandidate } from "../../guidebook";

import { containsCjk, resolveFilePathByEditorView } from "../../../utils";

export function createGuidebookQuickInsertExt(
	plugin: Plugin,
	getSettings: () => SettingDatas,
	guidebookQuickInsertService: GuidebookQuickInsertService,
): Extension {
	const novelLibraryService = new NovelLibraryService(plugin.app);

	// 面板与刷新生命周期由 shared-autocomplete 统一处理；此文件只提供策略钩子。
	return createSharedAutocompleteExt<GuidebookQuickInsertCandidate, { filePath: string }>({
		getSettings,
		isEnabled: (settings) => settings.snippetQuickInsertEnabled,
		// 在当前行尾使用 //<query> 触发补全。
		resolveTriggerMatch: (view) => resolveLineSuffixTriggerMatch(view, /\/\/([^\s/]+)$/),
		// 设定库快速插入仅对 CJK 关键字生效。
		isMatchAllowed: (match) => containsCjk(match.query),
		resolveContext: (view, settings) => {
			const filePath = resolveFilePathByEditorView(plugin.app, view);
			if (!filePath) {
				return null;
			}
			// 光标位于功能库目录内时不提供建议，避免在源数据区触发插入。
			if (novelLibraryService.isInFeatureRoot(filePath, settings)) {
				return null;
			}
			return { filePath };
		},
		// 基于当前文件路径与查询词向服务端请求候选项。
		queryCandidates: ({ settings, match, context }) =>
			guidebookQuickInsertService.queryGuidebookCandidates({
				settings,
				filePath: context.filePath,
				query: match.query,
			}),
		getItemKey: (item, index) => `${item.keyword}-${index}`,
		getItemLabel: (item) => item.keyword,
		// 选中后用关键字替换触发文本，并将光标移动到插入内容末尾。
		resolveInsertion: (item) => ({
			insertText: item.keyword,
			cursorOffset: item.keyword.length,
		}),
		emptyTextKey: "feature.snippet.quick_insert.candidate.empty",
	});
}



