import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export interface TextDetectionRule {
	isEnabled: (view: EditorView) => boolean;
	matchIndices?: (lineText: string) => number[];
	matchDocumentIndices?: (docText: string) => number[];
}

function buildDecorations(view: EditorView, rules: TextDetectionRule[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const enabledLineRules: TextDetectionRule[] = [];
	const enabledDocumentRules: TextDetectionRule[] = [];
	const hitIndices = new Set<number>();

	for (const rule of rules) {
		if (!rule.isEnabled(view)) {
			continue;
		}
		if (rule.matchDocumentIndices) {
			enabledDocumentRules.push(rule);
		}
		if (rule.matchIndices) {
			enabledLineRules.push(rule);
		}
	}

	if (enabledDocumentRules.length > 0) {
		const docText = view.state.doc.toString();
		for (const rule of enabledDocumentRules) {
			const indices = rule.matchDocumentIndices?.(docText) ?? [];
			for (const index of indices) {
				if (index < 0 || index >= view.state.doc.length) {
					continue;
				}
				hitIndices.add(index);
			}
		}
	}

	for (const { from, to } of view.visibleRanges) {
		let line = view.state.doc.lineAt(from);
		while (line.from <= to) {
			for (const rule of enabledLineRules) {
				const indices = rule.matchIndices?.(line.text) ?? [];
				for (const index of indices) {
					const charFrom = line.from + index;
					if (charFrom < 0 || charFrom >= view.state.doc.length) {
						continue;
					}
					hitIndices.add(charFrom);
				}
			}

			if (line.to >= to || line.number >= view.state.doc.lines) {
				break;
			}
			line = view.state.doc.line(line.number + 1);
		}
	}

	const sortedHitIndices = Array.from(hitIndices).sort((a, b) => a - b);
	for (const index of sortedHitIndices) {
		builder.add(
			index,
			index + 1,
			Decoration.mark({
				class: "cna-text-detection-hit",
			}),
		);
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
				if (update.docChanged || update.viewportChanged || update.geometryChanged || update.transactions.length > 0) {
					this.decorations = buildDecorations(update.view, rules);
				}
			}
		},
		{
			decorations: (value) => value.decorations,
		},
	);
}
