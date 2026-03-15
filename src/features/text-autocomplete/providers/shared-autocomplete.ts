import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { translate, type TranslationKey } from "../../../lang";
import { type SettingDatas } from "../../../core";
import { CandidatePanelComponent } from "../../../ui/componets/candidate-panel";

export interface TriggerMatch {
	from: number;
	to: number;
	query: string;
}

export interface CandidateInsertion {
	insertText: string;
	cursorOffset: number;
}

interface QueryParams<TContext> {
	settings: SettingDatas;
	match: TriggerMatch;
	context: TContext;
}

interface SharedAutocompleteOptions<TCandidate, TContext> {
	getSettings: () => SettingDatas;
	isEnabled: (settings: SettingDatas) => boolean;
	resolveTriggerMatch: (view: EditorView) => TriggerMatch | null;
	isMatchAllowed?: (match: TriggerMatch, settings: SettingDatas) => boolean;
	resolveContext: (view: EditorView, settings: SettingDatas) => TContext | null;
	queryCandidates: (params: QueryParams<TContext>) => Promise<readonly TCandidate[]>;
	getItemKey: (item: TCandidate, index: number) => string;
	getItemLabel: (item: TCandidate) => string;
	resolveInsertion: (item: TCandidate) => CandidateInsertion;
	emptyTextKey: TranslationKey;
}

export function createSharedAutocompleteExt<TCandidate, TContext>(
	options: SharedAutocompleteOptions<TCandidate, TContext>,
): Extension {
	return Prec.high(
		ViewPlugin.fromClass(
			class {
				private view: EditorView;
				private panel: CandidatePanelComponent<TCandidate>;
				private triggerMatch: TriggerMatch | null = null;
				private refreshSeq = 0;

				constructor(view: EditorView) {
					this.view = view;
					this.panel = new CandidatePanelComponent<TCandidate>({
						pageSize: Math.max(1, options.getSettings().snippetQuickInsertPageSize),
						getItemKey: options.getItemKey,
						getItemLabel: options.getItemLabel,
						getFooterText: ({ page, totalPages }) => this.buildFooterText(page, totalPages),
						onSelect: (item) => {
							this.applySelectedItem(item);
						},
					});
					void this.refreshPanel();
				}

				update(update: ViewUpdate): void {
					if (
						update.docChanged ||
						update.selectionSet ||
						update.focusChanged ||
						update.viewportChanged ||
						update.geometryChanged
					) {
						void this.refreshPanel();
					}
				}

				destroy(): void {
					this.panel.destroy();
				}

				private async refreshPanel(): Promise<void> {
					const seq = ++this.refreshSeq;
					const settings = options.getSettings();
					if (!options.isEnabled(settings)) {
						this.hidePanel();
						return;
					}

					const match = options.resolveTriggerMatch(this.view);
					if (!match) {
						this.hidePanel();
						return;
					}
					if (options.isMatchAllowed && !options.isMatchAllowed(match, settings)) {
						this.hidePanel();
						return;
					}
					if (isInCodeContext(this.view, match.to)) {
						this.hidePanel();
						return;
					}

					const context = options.resolveContext(this.view, settings);
					if (!context) {
						this.hidePanel();
						return;
					}

					const candidates = await options.queryCandidates({
						settings,
						match,
						context,
					});
					if (seq !== this.refreshSeq) {
						return;
					}
					if (candidates.length === 0) {
						this.hidePanel();
						return;
					}

					const coords = this.view.coordsAtPos(match.to);
					if (!coords) {
						this.hidePanel();
						return;
					}

					this.triggerMatch = match;
					this.panel.show({
						items: candidates,
						page: 1,
						pageSize: Math.max(1, settings.snippetQuickInsertPageSize),
						selectedIndex: 0,
						emptyText: translate(settings.locale, options.emptyTextKey),
						anchorRect: new DOMRect(
							coords.left,
							coords.top,
							Math.max(1, coords.right - coords.left),
							Math.max(1, coords.bottom - coords.top),
						),
					});
				}

				private applySelectedItem(item: TCandidate): void {
					const match = this.triggerMatch;
					if (!match) {
						return;
					}

					const insertion = options.resolveInsertion(item);
					this.view.dispatch({
						changes: {
							from: match.from,
							to: match.to,
							insert: insertion.insertText,
						},
						selection: EditorSelection.cursor(match.from + insertion.cursorOffset),
						userEvent: "input.complete",
					});
					this.hidePanel();
				}

				private buildFooterText(page: number, totalPages: number): string {
					const locale = options.getSettings().locale;
					const template = translate(locale, "feature.snippet.candidate.footer");
					return template
						.replace("{current}", String(page))
						.replace("{total}", String(totalPages));
				}

				handlePanelKeydown(event: KeyboardEvent): boolean {
					if (!this.panel.isVisible()) {
						return false;
					}
					if (event.isComposing) {
						return false;
					}
					const handled = this.panel.handleKeydown(event);
					if (handled) {
						event.preventDefault();
						event.stopPropagation();
					}
					return handled;
				}

				hidePanel(): void {
					this.triggerMatch = null;
					this.panel.hide();
				}
			},
			{
				eventHandlers: {
					keydown(event: Event): boolean {
						return this.handlePanelKeydown(event as KeyboardEvent);
					},
					blur(): boolean {
						this.hidePanel();
						return false;
					},
				},
			},
		),
	);
}

export function resolveLineSuffixTriggerMatch(
	view: EditorView,
	pattern: RegExp,
): TriggerMatch | null {
	const selection = view.state.selection.main;
	if (!selection.empty) {
		return null;
	}

	const cursor = selection.from;
	const line = view.state.doc.lineAt(cursor);
	const cursorInLine = cursor - line.from;
	const beforeCursor = line.text.slice(0, cursorInLine);
	const matched = beforeCursor.match(pattern);
	if (!matched) {
		return null;
	}
	const token = matched[0] ?? "";
	const query = matched[1] ?? "";
	if (!token || !query) {
		return null;
	}
	return {
		from: cursor - token.length,
		to: cursor,
		query,
	};
}

function isInCodeContext(view: EditorView, cursor: number): boolean {
	const line = view.state.doc.lineAt(cursor);
	const cursorInLine = cursor - line.from;
	const beforeCursor = line.text.slice(0, cursorInLine);
	const backtickCount = (beforeCursor.match(/`/g) ?? []).length;
	if (backtickCount % 2 === 1) {
		return true;
	}

	let activeFence: string | null = null;
	for (let lineNumber = 1; lineNumber <= line.number; lineNumber += 1) {
		const sourceLine = view.state.doc.line(lineNumber).text.trimStart();
		const fenceMatched = sourceLine.match(/^(```+|~~~+)/);
		if (!fenceMatched) {
			continue;
		}
		const marker = fenceMatched[1] ?? "";
		if (!marker) {
			continue;
		}
		if (!activeFence) {
			activeFence = marker;
			continue;
		}
		if (marker.startsWith(activeFence[0] ?? "")) {
			activeFence = null;
		}
	}
	return activeFence !== null;
}

