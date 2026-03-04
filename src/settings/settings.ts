import type { SupportedLocale } from "../lang";

export interface ChineseNovelAssistantSettings {
	locale: SupportedLocale;
	keywordHighlightMode: "first" | "all";
	keywordHighlightBackgroundColor: string;
	keywordUnderlineStyle: "none" | "solid" | "dashed" | "dotted" | "double" | "wavy";
	keywordUnderlineWidth: number;
	keywordUnderlineColor: string;
	keywordFontWeight: "normal" | "bold";
	keywordFontStyle: "normal" | "italic";
	keywordTextColor: string;
	previewMainHoverEnabled: boolean;
	previewSidebarHoverEnabled: boolean;
	previewWidth: number;
	previewHeight: number;
	previewMaxLines: number;
	noteEnabled: boolean;
	noteDefaultRows: number;
	noteImageAutoExpand: boolean;
	noteTagHintTextEnabled: boolean;
	notePath: string;
	novelLibraries: string[];
	customDirNamesEnabled: boolean;
	guidebookDirName: string;
	noteDirName: string;
	snippetDirName: string;
	proofreadDictionaryDirName: string;
	snippetQuickInsertEnabled: boolean;
	snippetQuickInsertPageSize: number;
	snippetTextFragmentEnabled: boolean;
	openFileInNewTab: boolean;
	enableCharacterCount: boolean;
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
	proofreadAutoCompletePairPunctuationEnabled: boolean;
	proofreadCustomDictionaryEnabled: boolean;
}

export function createDefaultSettings(locale: SupportedLocale): ChineseNovelAssistantSettings {
	return {
		locale,
		keywordHighlightMode: "first",
		keywordHighlightBackgroundColor: "#FFFFFF00",
		keywordUnderlineStyle: "dotted",
		keywordUnderlineWidth: 1,
		keywordUnderlineColor: "#4A86E9",
		keywordFontWeight: "normal",
		keywordFontStyle: "normal",
		keywordTextColor: "#4A86E9",
		previewMainHoverEnabled: true,
		previewSidebarHoverEnabled: false,
		previewWidth: 320,
		previewHeight: 260,
		previewMaxLines: 8,
		noteEnabled: true,
		noteDefaultRows: 6,
		noteImageAutoExpand: true,
		noteTagHintTextEnabled: true,
		notePath: "",
		novelLibraries: [],
		customDirNamesEnabled: false,
		guidebookDirName: "设定库",
		noteDirName: "便签库",
		snippetDirName: "片段库",
		proofreadDictionaryDirName: "纠错词库",
		snippetQuickInsertEnabled: true,
		snippetQuickInsertPageSize: 8,
		snippetTextFragmentEnabled: true,
		openFileInNewTab: true,
		enableCharacterCount: true,
		countOnlyNovelLibrary: true,
		typesetEnabled: false,
		typesetIndentChars: 2,
		typesetLineSpacing: 1,
		typesetParagraphSpacing: 12,
		typesetShowHeadingIcons: false,
		typesetJustifyText: false,
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
		proofreadAutoCompletePairPunctuationEnabled: false,
		proofreadCustomDictionaryEnabled: false,
	};
}

export const DEFAULT_SETTINGS: ChineseNovelAssistantSettings = createDefaultSettings("zh_cn");
