import type { EditorView } from "@codemirror/view";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import type { TextDetectionRule } from "../engine";

interface EnPunctuationRuleConfig {
	char: string;
	enabled: (settings: ChineseNovelAssistantSettings) => boolean;
	allowContextRegex?: RegExp;
}

interface EnPunctuationFixState {
	nextDoubleQuoteOpen: boolean;
	nextSingleQuoteOpen: boolean;
}

export interface EnPunctuationFixResult {
	text: string;
	replacedCount: number;
}

const PUNCTUATION_RULE_CONFIGS: EnPunctuationRuleConfig[] = [
	{
		char: ",",
		enabled: (settings) => settings.proofreadEnglishCommaEnabled,
	},
	{
		char: ".",
		enabled: (settings) => settings.proofreadEnglishPeriodEnabled,
		// 1.2 / 1. 
		allowContextRegex: /^(?:\d\.\d.|\d\. .)$/,
	},
	{
		char: ":",
		enabled: (settings) => settings.proofreadEnglishColonEnabled,
		// 12:34
		allowContextRegex: /^[0-9]{1,2}:[0-9]{2}$/,
	},
	{
		char: ";",
		enabled: (settings) => settings.proofreadEnglishSemicolonEnabled,
	},
	{
		char: "!",
		enabled: (settings) => settings.proofreadEnglishExclamationEnabled,
		// [!a
		allowContextRegex: /^\[![A-Za-z0-9].$/,
	},
	{
		char: "?",
		enabled: (settings) => settings.proofreadEnglishQuestionEnabled,
	},
	{
		char: "\"",
		enabled: (settings) => settings.proofreadQuoteEnabled,
	},
	{
		char: "'",
		enabled: (settings) => settings.proofreadSingleQuoteEnabled,
		// 'a OR a'
		allowContextRegex: /^(?:[A-Za-z]'..|.'[A-Za-z].)$/,
	},
];

const DIRECT_REPLACEMENT_MAP: Record<string, string> = {
	",": "，",
	".": "。",
	":": "：",
	";": "；",
	"!": "！",
	"?": "？",
};

function getCharAt(lineText: string, index: number): string {
	if (index < 0 || index >= lineText.length) {
		return " ";
	}
	return lineText.charAt(index);
}

function isAllowedByContext(docText: string, index: number, targetChar: string, allowContextRegex?: RegExp): boolean {
	if (!allowContextRegex) {
		return false;
	}
	const prev = getCharAt(docText, index - 1);
	const next = getCharAt(docText, index + 1);
	const next2 = getCharAt(docText, index + 2);
	const context = `${prev}${targetChar}${next}${next2}`;
	return allowContextRegex.test(context);
}

function findCharErrorIndicesInDoc(docText: string, targetChar: string, allowContextRegex?: RegExp): number[] {
	const indices: number[] = [];
	for (let i = 0; i < docText.length; i += 1) {
		if (docText[i] !== targetChar) {
			continue;
		}

		if (isAllowedByContext(docText, i, targetChar, allowContextRegex)) {
			continue;
		}

		indices.push(i);
	}
	return indices;
}

function getReplacementChar(char: string, state: EnPunctuationFixState): string | null {
	const direct = DIRECT_REPLACEMENT_MAP[char];
	if (direct) {
		return direct;
	}
	if (char === "\"") {
		const replacement = state.nextDoubleQuoteOpen ? "“" : "”";
		state.nextDoubleQuoteOpen = !state.nextDoubleQuoteOpen;
		return replacement;
	}
	if (char === "'") {
		const replacement = state.nextSingleQuoteOpen ? "‘" : "’";
		state.nextSingleQuoteOpen = !state.nextSingleQuoteOpen;
		return replacement;
	}
	return null;
}

export function fixEnPunctuationErrors(
	docText: string,
	settings: ChineseNovelAssistantSettings,
): EnPunctuationFixResult {
	if (!settings.proofreadCommonPunctuationEnabled) {
		return { text: docText, replacedCount: 0 };
	}

	const outputChars = Array.from(docText);
	const sourceText = docText;
	let replacedCount = 0;
	const state: EnPunctuationFixState = {
		nextDoubleQuoteOpen: true,
		nextSingleQuoteOpen: true,
	};

	for (let i = 0; i < sourceText.length; i += 1) {
		const char = sourceText.charAt(i);
		for (const config of PUNCTUATION_RULE_CONFIGS) {
			if (!config.enabled(settings) || config.char !== char) {
				continue;
			}
			if (isAllowedByContext(sourceText, i, char, config.allowContextRegex)) {
				break;
			}
			const replacement = getReplacementChar(char, state);
			if (!replacement || replacement === char) {
				break;
			}
			outputChars[i] = replacement;
			replacedCount += 1;
			break;
		}
	}

	return { text: outputChars.join(""), replacedCount };
}

export function createEnPunctuationRules(
	getSettings: () => ChineseNovelAssistantSettings,
	shouldDetectInView?: (view: EditorView) => boolean,
): TextDetectionRule[] {
	return PUNCTUATION_RULE_CONFIGS.map((config) => ({
		isEnabled: (view) => {
			if (shouldDetectInView && !shouldDetectInView(view)) {
				return false;
			}
			const settings = getSettings();
			return settings.proofreadCommonPunctuationEnabled && config.enabled(settings);
		},
		matchDocumentIndices: (docText) => findCharErrorIndicesInDoc(docText, config.char, config.allowContextRegex),
	}));
}
