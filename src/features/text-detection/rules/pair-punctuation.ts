import type { EditorView } from "@codemirror/view";
import { type SettingDatas } from "../../../core";
import type { TextDetectionRule } from "../engine";

interface PairToken {
	open: string;
	close: string;
	group: "common" | "double-quote" | "single-quote";
}

interface StackEntry {
	open: string;
	index: number;
}

interface PairRuleConfig {
	group: PairToken["group"];
	isSubEnabled: (settings: SettingDatas) => boolean;
}

export interface PairPunctuationFixResult {
	text: string;
	replacedCount: number;
}

const COMMON_PAIR_TOKENS: PairToken[] = [
	{ open: "‘", close: "’", group: "single-quote" },
	{ open: "“", close: "”", group: "double-quote" },
	{ open: "{", close: "}", group: "common" },
	{ open: "｛", close: "｝", group: "common" },
	{ open: "(", close: ")", group: "common" },
	{ open: "（", close: "）", group: "common" },
	{ open: "<", close: ">", group: "common" },
	{ open: "《", close: "》", group: "common" },
	{ open: "〈", close: "〉", group: "common" },
	{ open: "〖", close: "〗", group: "common" },
	{ open: "【", close: "】", group: "common" },
	{ open: "「", close: "」", group: "common" },
	{ open: "『", close: "』", group: "common" },
	{ open: "〔", close: "〕", group: "common" },
];

const PAIR_RULE_CONFIGS: PairRuleConfig[] = [
	{
		group: "common",
		isSubEnabled: (settings) => settings.proofreadPairPunctuationEnabled,
	},
	{
		group: "double-quote",
		isSubEnabled: (settings) => settings.proofreadQuoteEnabled,
	},
	{
		group: "single-quote",
		isSubEnabled: (settings) => settings.proofreadSingleQuoteEnabled,
	},
];

function isLineLeadingBlockquoteMarker(docText: string, index: number): boolean {
	if (docText.charAt(index) !== ">") {
		return false;
	}

	const lineStart = docText.lastIndexOf("\n", index - 1) + 1;
	let cursor = lineStart;
	while (cursor < index) {
		const char = docText.charAt(cursor);
		if (char === " " || char === "\t") {
			cursor += 1;
			continue;
		}
		if (char === ">") {
			cursor += 1;
			const afterQuote = docText.charAt(cursor);
			if (afterQuote === " " || afterQuote === "\t") {
				cursor += 1;
			}
			continue;
		}
		return false;
	}
	return true;
}

// When > appears at the beginning of a line, it will be treated as a quote by Obsidian. Skip such leading >
function createPairErrorFinder(pairTokens: PairToken[]): (docText: string) => number[] {
	const openToClose = new Map<string, string>(pairTokens.map((token) => [token.open, token.close]));
	const closers = new Set<string>(pairTokens.map((token) => token.close));

	return (docText: string): number[] => {
		const errorIndices = new Set<number>();
		const stack: StackEntry[] = [];

		for (let i = 0; i < docText.length; i += 1) {
			const char = docText.charAt(i);
			const close = openToClose.get(char);
			if (close) {
				stack.push({ open: char, index: i });
				continue;
			}

			if (!closers.has(char)) {
				continue;
			}
			if (char === ">" && isLineLeadingBlockquoteMarker(docText, i)) {
				continue;
			}

			let matchedOpenStackIndex = -1;
			for (let j = stack.length - 1; j >= 0; j -= 1) {
				const candidate = stack[j];
				if (!candidate) {
					continue;
				}
				if (openToClose.get(candidate.open) === char) {
					matchedOpenStackIndex = j;
					break;
				}
			}

			if (matchedOpenStackIndex < 0) {
				errorIndices.add(i);
				continue;
			}

			for (let j = stack.length - 1; j > matchedOpenStackIndex; j -= 1) {
				const unmatchedOpen = stack[j];
				if (!unmatchedOpen) {
					continue;
				}
				errorIndices.add(unmatchedOpen.index);
			}

			stack.length = matchedOpenStackIndex;
		}

		for (const entry of stack) {
			errorIndices.add(entry.index);
		}

		return Array.from(errorIndices).sort((a, b) => a - b);
	};
}

function getEnabledPairTokens(settings: SettingDatas): PairToken[] {
	if (!settings.proofreadCommonPunctuationEnabled) {
		return [];
	}

	const enabledGroups = new Set<PairToken["group"]>();
	for (const config of PAIR_RULE_CONFIGS) {
		if (config.isSubEnabled(settings)) {
			enabledGroups.add(config.group);
		}
	}

	return COMMON_PAIR_TOKENS.filter((token) => enabledGroups.has(token.group));
}

function collectPairPunctuationErrorIndices(docText: string, settings: SettingDatas): number[] {
	if (!settings.proofreadCommonPunctuationEnabled) {
		return [];
	}

	const errorIndices = new Set<number>();
	for (const config of PAIR_RULE_CONFIGS) {
		if (!config.isSubEnabled(settings)) {
			continue;
		}
		const tokens = COMMON_PAIR_TOKENS.filter((token) => token.group === config.group);
		const findPairErrors = createPairErrorFinder(tokens);
		const indices = findPairErrors(docText);
		for (const index of indices) {
			errorIndices.add(index);
		}
	}

	return Array.from(errorIndices).sort((a, b) => a - b);
}

export function fixPairPunctuationErrors(
	docText: string,
	settings: SettingDatas,
): PairPunctuationFixResult {
	const errorIndices = new Set<number>(collectPairPunctuationErrorIndices(docText, settings));
	if (errorIndices.size === 0) {
		return { text: docText, replacedCount: 0 };
	}

	const enabledTokens = getEnabledPairTokens(settings);
	const charToToken = new Map<string, PairToken>();
	for (const token of enabledTokens) {
		charToToken.set(token.open, token);
		charToToken.set(token.close, token);
	}

	const outputChars = Array.from(docText);
	const nextShouldOpenByToken = new Map<string, boolean>();
	let replacedCount = 0;

	for (let i = 0; i < outputChars.length; i += 1) {
		if (!errorIndices.has(i)) {
			continue;
		}

		const sourceChar = docText.charAt(i);
		const token = charToToken.get(sourceChar);
		if (!token) {
			continue;
		}

		const tokenKey = `${token.open}|${token.close}`;
		const nextShouldOpen = nextShouldOpenByToken.get(tokenKey) ?? true;
		const replacementChar = nextShouldOpen ? token.open : token.close;
		nextShouldOpenByToken.set(tokenKey, !nextShouldOpen);

		if (outputChars[i] !== replacementChar) {
			outputChars[i] = replacementChar;
			replacedCount += 1;
		}
	}

	return { text: outputChars.join(""), replacedCount };
}

export function createPairPunctuationRules(
	getSettings: () => SettingDatas,
	shouldDetectInView?: (view: EditorView) => boolean,
): TextDetectionRule[] {
	return PAIR_RULE_CONFIGS.map((config) => {
		const tokens = COMMON_PAIR_TOKENS.filter((token) => token.group === config.group);
		const findPairErrors = createPairErrorFinder(tokens);
		return {
			isEnabled: (view) => {
				if (shouldDetectInView && !shouldDetectInView(view)) {
					return false;
				}
				const settings = getSettings();
				return settings.proofreadCommonPunctuationEnabled && config.isSubEnabled(settings);
			},
			matchDocumentIndices: (docText: string) => findPairErrors(docText),
		};
	});
}



