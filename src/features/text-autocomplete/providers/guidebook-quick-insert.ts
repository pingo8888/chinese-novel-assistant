import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Plugin } from "obsidian";
import { translate } from "../../../lang";
import type { SettingDatas } from "../../../core/setting-datas";
import {
	GuidebookQuickInsertService,
	type GuidebookQuickInsertCandidate,
} from "../../../services/guidebook-quick-insert-service";
import { NovelLibraryService } from "../../../services/novel-library-service";
import { CandidatePanelComponent } from "../../../ui/componets/candidate-panel";
import { resolveMarkdownViewByEditorView } from "../../../utils/markdown-editor-view";

interface TriggerMatch {
	from: number;
	to: number;
	query: string;
}

export function createGuidebookQuickInsertAutocompleteExtension(
	plugin: Plugin,
	getSettings: () => SettingDatas,
	guidebookQuickInsertService: GuidebookQuickInsertService,
): Extension {
	const novelLibraryService = new NovelLibraryService(plugin.app);

	return Prec.high(
		ViewPlugin.fromClass(
			class {
				private view: EditorView;
				private panel: CandidatePanelComponent<GuidebookQuickInsertCandidate>;
				private triggerMatch: TriggerMatch | null = null;
				private refreshSeq = 0;

				constructor(view: EditorView) {
					this.view = view;
					this.panel = new CandidatePanelComponent<GuidebookQuickInsertCandidate>({
						pageSize: Math.max(1, getSettings().snippetQuickInsertPageSize),
						getItemKey: (item, index) => `${item.keyword}-${index}`,
						getItemLabel: (item) => item.keyword,
						getFooterText: ({ page, totalPages }) => this.buildFooterText(page, totalPages),
						onSelect: (item) => {
							this.applySelectedCandidate(item);
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
					const settings = getSettings();
					if (!settings.snippetQuickInsertEnabled) {
						this.hidePanel();
						return;
					}

					const match = this.resolveTriggerMatch();
					if (!match || !containsCjk(match.query)) {
						this.hidePanel();
						return;
					}

					if (this.isInCodeContext(match.to)) {
						this.hidePanel();
						return;
					}

					const filePath = this.resolveActiveFilePath();
					if (!filePath) {
						this.hidePanel();
						return;
					}

					if (this.isInsideFeatureRoot(filePath, settings)) {
						this.hidePanel();
						return;
					}

					const candidates = await guidebookQuickInsertService.queryGuidebookCandidates({
						settings,
						filePath,
						query: match.query,
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
						emptyText: translate(settings.locale, "feature.snippet.quick_insert.candidate.empty"),
						anchorRect: new DOMRect(
							coords.left,
							coords.top,
							Math.max(1, coords.right - coords.left),
							Math.max(1, coords.bottom - coords.top),
						),
					});
				}

				private resolveTriggerMatch(): TriggerMatch | null {
					const selection = this.view.state.selection.main;
					if (!selection.empty) {
						return null;
					}

					const cursor = selection.from;
					const line = this.view.state.doc.lineAt(cursor);
					const cursorInLine = cursor - line.from;
					const beforeCursor = line.text.slice(0, cursorInLine);
					const matched = beforeCursor.match(/\/\/([^\s/]+)$/);
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

				private isInCodeContext(cursor: number): boolean {
					const line = this.view.state.doc.lineAt(cursor);
					const cursorInLine = cursor - line.from;
					const beforeCursor = line.text.slice(0, cursorInLine);
					const backtickCount = (beforeCursor.match(/`/g) ?? []).length;
					if (backtickCount % 2 === 1) {
						return true;
					}

					let activeFence: string | null = null;
					for (let lineNumber = 1; lineNumber <= line.number; lineNumber += 1) {
						const sourceLine = this.view.state.doc.line(lineNumber).text.trimStart();
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

				private resolveActiveFilePath(): string | null {
					const markdownView = resolveMarkdownViewByEditorView(plugin.app, this.view);
					return markdownView?.file?.path ?? null;
				}

				private isInsideFeatureRoot(
					filePath: string,
					settings: Pick<SettingDatas, "locale" | "novelLibraries">,
				): boolean {
					const normalizedFilePath = novelLibraryService.normalizeVaultPath(filePath);
					if (!normalizedFilePath) {
						return false;
					}
					const normalizedLibraries = settings.novelLibraries
						.map((path) => novelLibraryService.normalizeVaultPath(path))
						.filter((path) => path.length > 0)
						.sort((left, right) => right.length - left.length);
					for (const libraryPath of normalizedLibraries) {
						if (!this.isSameOrChildPath(normalizedFilePath, libraryPath)) {
							continue;
						}
						const featureRoot = novelLibraryService.resolveNovelLibraryFeatureRootPath(
							{ locale: settings.locale },
							libraryPath,
						);
						if (featureRoot && this.isSameOrChildPath(normalizedFilePath, featureRoot)) {
							return true;
						}
					}
					return false;
				}

				private applySelectedCandidate(candidate: GuidebookQuickInsertCandidate): void {
					const match = this.triggerMatch;
					if (!match) {
						return;
					}

					this.view.dispatch({
						changes: {
							from: match.from,
							to: match.to,
							insert: candidate.keyword,
						},
						selection: EditorSelection.cursor(match.from + candidate.keyword.length),
						userEvent: "input.complete",
					});
					this.hidePanel();
				}

				private buildFooterText(page: number, totalPages: number): string {
					const locale = getSettings().locale;
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

				private isSameOrChildPath(path: string, root: string): boolean {
					return path === root || path.startsWith(`${root}/`);
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

function containsCjk(value: string): boolean {
	return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(value);
}


