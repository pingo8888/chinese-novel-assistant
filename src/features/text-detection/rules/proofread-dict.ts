import type { EditorView } from "@codemirror/view";
import type { SettingDatas } from "../../../core/setting-datas";
import type { TextDetectionRule } from "../engine";

interface ReplacementMatch {
	from: number;
	to: number;
	wrong: string;
	correct: string;
}

interface DictionarySnapshotLike {
	replacements: ReadonlyMap<string, string>;
	wrongWordsDesc: readonly string[];
}

export interface ProofreadDictFixResult {
	text: string;
	replacedCount: number;
}

export function createProofreadDictRules(
	getSettings: () => SettingDatas,
	getDictionarySnapshot: () => DictionarySnapshotLike,
	shouldDetectInView?: (view: EditorView) => boolean,
): TextDetectionRule[] {
	return [
		{
			isEnabled: (view) => {
				if (shouldDetectInView && !shouldDetectInView(view)) {
					return false;
				}
				return getSettings().proofreadCustomDictionaryEnabled;
			},
			matchDocumentIndices: (docText: string) => {
				const settings = getSettings();
				if (!settings.proofreadCustomDictionaryEnabled) {
					return [];
				}

				const dictionary = getDictionarySnapshot();
				const matches = collectReplacementMatches(docText, dictionary.replacements, dictionary.wrongWordsDesc);
				if (matches.length === 0) {
					return [];
				}

				const hitIndices: number[] = [];
				for (const match of matches) {
					for (let index = match.from; index < match.to; index += 1) {
						hitIndices.push(index);
					}
				}
				return hitIndices;
			},
		},
	];
}

export function fixProofreadDictErrors(
	docText: string,
	replacements: ReadonlyMap<string, string>,
	wrongWordsDesc: readonly string[],
): ProofreadDictFixResult {
	const matches = collectReplacementMatches(docText, replacements, wrongWordsDesc);
	if (matches.length === 0) {
		return { text: docText, replacedCount: 0 };
	}

	let cursor = 0;
	let output = "";
	let replacedCount = 0;
	for (const match of matches) {
		output += docText.slice(cursor, match.from);
		output += match.correct;
		cursor = match.to;
		if (match.correct !== match.wrong) {
			replacedCount += 1;
		}
	}
	output += docText.slice(cursor);

	if (replacedCount <= 0) {
		return { text: docText, replacedCount: 0 };
	}
	return { text: output, replacedCount };
}

function collectReplacementMatches(
	docText: string,
	replacements: ReadonlyMap<string, string>,
	wrongWordsDesc: readonly string[],
): ReplacementMatch[] {
	if (docText.length === 0 || wrongWordsDesc.length === 0 || replacements.size === 0) {
		return [];
	}

	const matches: ReplacementMatch[] = [];
	for (let index = 0; index < docText.length; index += 1) {
		let matched = false;
		for (const wrong of wrongWordsDesc) {
			if (!wrong || wrong.length === 0) {
				continue;
			}
			if (!docText.startsWith(wrong, index)) {
				continue;
			}

			const correct = replacements.get(wrong);
			if (correct === undefined) {
				continue;
			}

			matches.push({
				from: index,
				to: index + wrong.length,
				wrong,
				correct,
			});
			index += wrong.length - 1;
			matched = true;
			break;
		}

		if (matched) {
			continue;
		}
	}

	return matches;
}


