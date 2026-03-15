import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { type SettingDatas } from "../../../core";

interface PairToken {
	open: string;
	close: string;
}

const COMMON_ZH_PAIR_TOKENS: PairToken[] = [
	{ open: "‘", close: "’" },
	{ open: "“", close: "”" },
	{ open: "（", close: "）" },
	{ open: "【", close: "】" },
	{ open: "〖", close: "〗" },
	{ open: "〔", close: "〕" },
	{ open: "<", close: ">" },
	{ open: "〈", close: "〉" },
	{ open: "《", close: "》" },
	{ open: "「", close: "」" },
	{ open: "『", close: "』" },
	{ open: "｛", close: "｝" },
];

const OPEN_TO_CLOSE = new Map<string, string>(COMMON_ZH_PAIR_TOKENS.map((token) => [token.open, token.close]));
const CLOSE_TO_OPEN = new Map<string, string>(COMMON_ZH_PAIR_TOKENS.map((token) => [token.close, token.open]));

function isEnabled(settings: SettingDatas): boolean {
	return settings.autocompletePairPunctuationEnabled;
}

export function createPairPunctuationAutocompleteExtension(
	getSettings: () => SettingDatas,
): Extension {
	return [
		Prec.high(
			EditorView.inputHandler.of((view, from, to, text) => {
				if (!isEnabled(getSettings()) || text.length !== 1) {
					return false;
				}

				const close = OPEN_TO_CLOSE.get(text);
				if (close) {
					const selection = view.state.selection;
					const shouldWrapSelection =
						selection.ranges.length === 1 &&
						!selection.main.empty &&
						selection.main.from === from &&
						selection.main.to === to;
					const selectedText = shouldWrapSelection ? view.state.doc.sliceString(from, to) : "";
					const insertedText = `${text}${selectedText}${close}`;
					const cursorPos = shouldWrapSelection ? from + text.length + selectedText.length : from + text.length;
					view.dispatch({
						changes: { from, to, insert: insertedText },
						selection: EditorSelection.cursor(cursorPos),
						userEvent: "input.type",
					});
					return true;
				}

				if (CLOSE_TO_OPEN.has(text) && from === to) {
					const nextChar = view.state.doc.sliceString(from, from + 1);
					if (nextChar === text) {
						view.dispatch({
							selection: EditorSelection.cursor(from + 1),
							userEvent: "input.type",
						});
						return true;
					}
				}

				return false;
			}),
		),
		Prec.high(
			keymap.of([
				{
					key: "Backspace",
					run: (view) => {
						if (!isEnabled(getSettings())) {
							return false;
						}

						const selection = view.state.selection;
						if (selection.ranges.length !== 1 || !selection.main.empty) {
							return false;
						}

						const cursor = selection.main.from;
						if (cursor <= 0 || cursor >= view.state.doc.length) {
							return false;
						}

						const prevChar = view.state.doc.sliceString(cursor - 1, cursor);
						const nextChar = view.state.doc.sliceString(cursor, cursor + 1);
						const expectedClose = OPEN_TO_CLOSE.get(prevChar);
						if (!expectedClose || expectedClose !== nextChar) {
							return false;
						}

						view.dispatch({
							changes: { from: cursor - 1, to: cursor + 1, insert: "" },
							selection: EditorSelection.cursor(cursor - 1),
							userEvent: "delete.backward",
						});
						return true;
					},
				},
			]),
		),
	];
}



