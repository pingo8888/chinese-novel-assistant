import type { SupportedLocale } from "../lang";
import { GUIDEBOOK_KEYWORD_DEFAULT_COLORS } from "../constants";

export interface ChineseNovelAssistantSettings {
	locale: SupportedLocale;
	guidebookCollectionOrders: Record<string, string[]>;
	guidebookTreeExpandedStates: Record<string, boolean>;
	guidebookTreeAllExpanded: boolean;
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
	stickyNoteEnabled: boolean;
	stickyNoteDefaultRows: number;
	stickyNoteImageAutoExpand: boolean;
	stickyNoteTagHintTextEnabled: boolean;
	stickyNotePath: string;
	novelLibraries: string[];
	customDirNamesEnabled: boolean;
	guidebookDirName: string;
	stickyNoteDirName: string;
	snippetDirName: string;
	proofreadDictionaryDirName: string;
	snippetQuickInsertEnabled: boolean;
	snippetQuickInsertPageSize: number;
	snippetTextFragmentEnabled: boolean;
	openFileInNewTab: boolean;
	enableCharacterCount: boolean;
	enableCharacterMilestone: boolean;
	countOnlyNovelLibrary: boolean;
	typesetEnabled: boolean;
	typesetIndentChars: number;
	typesetLineSpacing: number;
	typesetParagraphSpacing: number;
	typesetShowHeadingIcons: boolean;
	typesetJustifyText: boolean;
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
	autocompletePairPunctuationEnabled: boolean;
	proofreadCustomDictionaryEnabled: boolean;
}

export function createDefaultSettings(locale: SupportedLocale): ChineseNovelAssistantSettings {
	return {
		locale,
			guidebookCollectionOrders: {},
			guidebookTreeExpandedStates: {},
			guidebookTreeAllExpanded: true,
			guidebookKeywordHighlightMode: "first",
		guidebookKeywordHighlightBackgroundColor: GUIDEBOOK_KEYWORD_DEFAULT_COLORS.highlightBackground,
		guidebookKeywordUnderlineStyle: "dotted",
		guidebookKeywordUnderlineWidth: 2,
		guidebookKeywordUnderlineColor: GUIDEBOOK_KEYWORD_DEFAULT_COLORS.underline,
		guidebookKeywordFontWeight: "normal",
		guidebookKeywordFontStyle: "normal",
		guidebookKeywordTextColor: GUIDEBOOK_KEYWORD_DEFAULT_COLORS.text,
		guidebookPreviewMainHoverEnabled: true,
		guidebookPreviewSidebarHoverEnabled: false,
		guidebookPreviewWidth: 320,
		guidebookPreviewMaxLines: 8,
		stickyNoteEnabled: true,
		stickyNoteDefaultRows: 5,
		stickyNoteImageAutoExpand: false,
		stickyNoteTagHintTextEnabled: true,
		stickyNotePath: "",
		novelLibraries: [],
		customDirNamesEnabled: false,
		guidebookDirName: "设定库",
		stickyNoteDirName: "便签库",
		snippetDirName: "片段库",
		proofreadDictionaryDirName: "纠错词库",
		snippetQuickInsertEnabled: true,
		snippetQuickInsertPageSize: 8,
		snippetTextFragmentEnabled: true,
			openFileInNewTab: true,
			enableCharacterCount: true,
			enableCharacterMilestone: true,
			countOnlyNovelLibrary: true,
		typesetEnabled: true,
		typesetIndentChars: 2,
		typesetLineSpacing: 1,
		typesetParagraphSpacing: 12,
		typesetShowHeadingIcons: false,
		typesetJustifyText: true,
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
		autocompletePairPunctuationEnabled: true,
		proofreadCustomDictionaryEnabled: false,
	};
}

export const DEFAULT_SETTINGS: ChineseNovelAssistantSettings = createDefaultSettings("zh_cn");

