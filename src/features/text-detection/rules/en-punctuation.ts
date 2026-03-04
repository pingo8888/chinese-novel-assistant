import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import type { TextDetectionRule } from "../engine";

interface EnPunctuationRuleConfig {
	char: string;
	enabled: (settings: ChineseNovelAssistantSettings) => boolean;
	allowContextRegex?: RegExp;
}

const PUNCTUATION_RULE_CONFIGS: EnPunctuationRuleConfig[] = [
	{
		char: ",",
		enabled: (settings) => settings.proofreadEnglishCommaEnabled,
	},
	{
		char: ".",
		enabled: (settings) => settings.proofreadEnglishPeriodEnabled,
		// 1.2
		allowContextRegex: /^\d\.\d.$/,
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

function getCharAt(lineText: string, index: number): string {
	if (index < 0 || index >= lineText.length) {
		return " ";
	}
	return lineText.charAt(index);
}

function findCharErrorIndices(lineText: string, targetChar: string, allowContextRegex?: RegExp): number[] {
	const indices: number[] = [];
	for (let i = 0; i < lineText.length; i += 1) {
		if (lineText[i] !== targetChar) {
			continue;
		}

		if (allowContextRegex) {
			const prev = getCharAt(lineText, i - 1);
			const next = getCharAt(lineText, i + 1);
			const next2 = getCharAt(lineText, i + 2);
			const context = `${prev}${targetChar}${next}${next2}`;
			if (allowContextRegex.test(context)) {
				continue;
			}
		}

		indices.push(i);
	}
	return indices;
}

export function createEnPunctuationRules(getSettings: () => ChineseNovelAssistantSettings): TextDetectionRule[] {
	return PUNCTUATION_RULE_CONFIGS.map((config) => ({
		isEnabled: () => {
			const settings = getSettings();
			return settings.proofreadCommonPunctuationEnabled && config.enabled(settings);
		},
		matchIndices: (lineText) => findCharErrorIndices(lineText, config.char, config.allowContextRegex),
	}));
}
