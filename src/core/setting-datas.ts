import type { SupportedLocale } from "../lang";

export interface SettingDatas {
	// 全局
	novelLibraries: string[];

	// 设定
	guidebookKeywordHighlightMode: "first" | "all";
	guidebookKeywordHighlightBackgroundColor: string;
	guidebookKeywordUnderlineStyle: "none" | "solid" | "dashed" | "dotted" | "double" | "wavy";
	guidebookKeywordUnderlineWidth: number;
	guidebookKeywordUnderlineColor: string;
	guidebookKeywordFontWeight: "normal" | "bold";
	guidebookKeywordFontStyle: "normal" | "italic";
	guidebookKeywordTextColor: string;
	guidebookPreviewMainHoverEnabled: boolean;
	guidebookPreviewSidebarHoverEnabled: boolean;
	guidebookPreviewWidth: number;
	guidebookPreviewMaxLines: number;
	guidebookWesternNameAutoAliasEnabled: boolean;

	// 便签
	stickyNoteEnabled: boolean;
	stickyNoteDefaultRows: number;
	stickyNoteTagHintTextEnabled: boolean;

	// 标注
	annotationEnabled: boolean;
	annotationAutoLocateOnFileSwitch: boolean;

	// 纠错
	proofreadCommonPunctuationEnabled: boolean;
	proofreadEnglishCommaEnabled: boolean;
	proofreadEnglishPeriodEnabled: boolean;
	proofreadEnglishColonEnabled: boolean;
	proofreadEnglishSemicolonEnabled: boolean;
	proofreadEnglishExclamationEnabled: boolean;
	proofreadEnglishQuestionEnabled: boolean;
	proofreadQuoteEnabled: boolean;
	proofreadSingleQuoteEnabled: boolean;
	proofreadPairPunctuationEnabled: boolean;
	proofreadCustomDictionaryEnabled: boolean;

	// 补全
	autocompletePairPunctuationEnabled: boolean;
	snippetQuickInsertEnabled: boolean;
	snippetTextFragmentEnabled: boolean;
	snippetQuickInsertPageSize: number;

	// 排版
	typesetEnabled: boolean;
	typesetIndentChars: number;
	typesetLineSpacing: number;
	typesetParagraphSpacing: number;
	typesetShowHeadingIcons: boolean;
	typesetJustifyText: boolean;

	// 其他
	locale: SupportedLocale;
	openFileInNewTab: boolean;
	enableCharacterCount: boolean;
	enableCharacterMilestone: boolean;
	countOnlyNovelLibrary: boolean;
	
	// 设定视图节点排序、展开与折叠数据
	guidebookCollectionOrders: Record<string, string[]>;
	guidebookTreeExpandedStates: Record<string, boolean>;
	guidebookTreeAllExpanded: boolean;

}

export function createDefaultSettings(): SettingDatas {
	return {
		novelLibraries: [],

		guidebookKeywordHighlightMode: "first",
		guidebookKeywordHighlightBackgroundColor: "#FFFFFF00",
		guidebookKeywordUnderlineStyle: "dotted",
		guidebookKeywordUnderlineWidth: 2,
		guidebookKeywordUnderlineColor: "#4A86E9",
		guidebookKeywordFontWeight: "normal",
		guidebookKeywordFontStyle: "normal",
		guidebookKeywordTextColor: "#4A86E9",
		guidebookPreviewMainHoverEnabled: true,
		guidebookPreviewSidebarHoverEnabled: false,
		guidebookPreviewWidth: 320,
		guidebookPreviewMaxLines: 8,
		guidebookWesternNameAutoAliasEnabled: false,
		stickyNoteEnabled: true,
		stickyNoteDefaultRows: 5,
		stickyNoteTagHintTextEnabled: true,
		annotationEnabled: false,
		annotationAutoLocateOnFileSwitch: true,

		proofreadCommonPunctuationEnabled: false,
		proofreadEnglishCommaEnabled: true,
		proofreadEnglishPeriodEnabled: true,
		proofreadEnglishColonEnabled: true,
		proofreadEnglishSemicolonEnabled: true,
		proofreadEnglishExclamationEnabled: true,
		proofreadEnglishQuestionEnabled: true,
		proofreadQuoteEnabled: true,
		proofreadSingleQuoteEnabled: true,
		proofreadPairPunctuationEnabled: true,
		proofreadCustomDictionaryEnabled: false,

		autocompletePairPunctuationEnabled: true,
		snippetQuickInsertEnabled: true,
		snippetTextFragmentEnabled: true,
		snippetQuickInsertPageSize: 8,

		typesetEnabled: true,
		typesetIndentChars: 2,
		typesetLineSpacing: 1,
		typesetParagraphSpacing: 12,
		typesetShowHeadingIcons: false,
		typesetJustifyText: true,

		locale: "zh_cn",
		openFileInNewTab: true,
		enableCharacterCount: true,
		enableCharacterMilestone: true,
		countOnlyNovelLibrary: true,

		guidebookCollectionOrders: {},
		guidebookTreeExpandedStates: {},
		guidebookTreeAllExpanded: true,
	};
}
