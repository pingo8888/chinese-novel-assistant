import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export interface TextDetectionRule {
	isEnabled: () => boolean;
	matchIndices: (lineText: string) => number[];
}

function buildDecorations(view: EditorView, rules: TextDetectionRule[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	for (const { from, to } of view.visibleRanges) {
		let line = view.state.doc.lineAt(from);
		while (line.from <= to) {
			for (const rule of rules) {
				if (!rule.isEnabled()) {
					continue;
				}
				const indices = rule.matchIndices(line.text);
				for (const index of indices) {
					const charFrom = line.from + index;
					builder.add(
						charFrom,
						charFrom + 1,
						Decoration.mark({
							class: "cna-text-detection-hit",
						}),
					);
				}
			}

			if (line.to >= to || line.number >= view.state.doc.lines) {
				break;
			}
			line = view.state.doc.line(line.number + 1);
		}
	}
	return builder.finish();
}

export function createTextDetectionExtension(rules: TextDetectionRule[]) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, rules);
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.decorations = buildDecorations(update.view, rules);
				}
			}
		},
		{
			decorations: (value) => value.decorations,
		},
	);
}
