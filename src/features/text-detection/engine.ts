import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export interface TextDetectionRule {
	isEnabled: (view: EditorView) => boolean;
	className?: string;
	matchIndices?: (lineText: string, view: EditorView) => number[];
	matchDocumentIndices?: (docText: string, view: EditorView) => number[];
}

function buildDecorations(view: EditorView, rules: TextDetectionRule[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const enabledLineRules: TextDetectionRule[] = [];
	const enabledDocumentRules: TextDetectionRule[] = [];
	const hitIndicesByClassName = new Map<string, Set<number>>();

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
			const indices = rule.matchDocumentIndices?.(docText, view) ?? [];
			const className = rule.className ?? "cna-text-detection-hit";
			const hitIndices = ensureHitIndicesSet(hitIndicesByClassName, className);
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
				const indices = rule.matchIndices?.(line.text, view) ?? [];
				const className = rule.className ?? "cna-text-detection-hit";
				const hitIndices = ensureHitIndicesSet(hitIndicesByClassName, className);
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

	const decorationSpans: Array<{ from: number; to: number; className: string }> = [];
	for (const [className, hitIndices] of hitIndicesByClassName) {
		const sortedHitIndices = Array.from(hitIndices).sort((a, b) => a - b);
		for (const range of collapseContinuousIndices(sortedHitIndices)) {
			decorationSpans.push({
				from: range.from,
				to: range.to,
				className,
			});
		}
	}

	decorationSpans.sort((left, right) => {
		if (left.from !== right.from) {
			return left.from - right.from;
		}
		if (left.to !== right.to) {
			return left.to - right.to;
		}
		return left.className.localeCompare(right.className);
	});
	for (const span of decorationSpans) {
		builder.add(
			span.from,
			span.to,
			Decoration.mark({
				class: span.className,
			}),
		);
	}

	return builder.finish();
}

function ensureHitIndicesSet(map: Map<string, Set<number>>, className: string): Set<number> {
	const existing = map.get(className);
	if (existing) {
		return existing;
	}
	const next = new Set<number>();
	map.set(className, next);
	return next;
}

function collapseContinuousIndices(sortedIndices: number[]): Array<{ from: number; to: number }> {
	if (sortedIndices.length === 0) {
		return [];
	}

	const ranges: Array<{ from: number; to: number }> = [];
	let rangeStart = sortedIndices[0] ?? 0;
	let previous = rangeStart;
	for (let i = 1; i < sortedIndices.length; i += 1) {
		const current = sortedIndices[i];
		if (current === undefined) {
			continue;
		}
		if (current === previous + 1) {
			previous = current;
			continue;
		}
		ranges.push({ from: rangeStart, to: previous + 1 });
		rangeStart = current;
		previous = current;
	}
	ranges.push({ from: rangeStart, to: previous + 1 });
	return ranges;
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
