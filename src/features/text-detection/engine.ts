import { Annotation, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export interface TextDetectionRange {
	from: number;
	to: number;
}

export interface TextDetectionRule {
	isEnabled: (view: EditorView) => boolean;
	className?: string;
	matchIndices?: (lineText: string, view: EditorView) => number[];
	matchDocumentIndices?: (docText: string, view: EditorView) => number[];
	matchDocumentRanges?: (docText: string, view: EditorView) => TextDetectionRange[];
}

const TEXT_DETECTION_FORCE_REFRESH = Annotation.define<boolean>();

function buildDecorations(view: EditorView, rules: TextDetectionRule[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const enabledLineRules: TextDetectionRule[] = [];
	const enabledDocumentRules: TextDetectionRule[] = [];
	const hitIndicesByClassName = new Map<string, Set<number>>();
	const explicitRangesByClassName = new Map<string, TextDetectionRange[]>();

	for (const rule of rules) {
		if (!rule.isEnabled(view)) {
			continue;
		}
		if (rule.matchDocumentIndices || rule.matchDocumentRanges) {
			enabledDocumentRules.push(rule);
		}
		if (rule.matchIndices) {
			enabledLineRules.push(rule);
		}
	}

	if (enabledDocumentRules.length > 0) {
		const docText = view.state.doc.toString();
		for (const rule of enabledDocumentRules) {
			const className = rule.className ?? "cna-text-detection-hit";
			const explicitRanges = rule.matchDocumentRanges?.(docText, view) ?? [];
			if (explicitRanges.length > 0) {
				const targetRanges = ensureRangeList(explicitRangesByClassName, className);
				for (const range of explicitRanges) {
					const normalized = normalizeRange(range, view.state.doc.length);
					if (!normalized) {
						continue;
					}
					targetRanges.push(normalized);
				}
			}

			const indices = rule.matchDocumentIndices?.(docText, view) ?? [];
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
	const classNames = new Set<string>([...hitIndicesByClassName.keys(), ...explicitRangesByClassName.keys()]);
	for (const className of classNames) {
		const mergedRanges: TextDetectionRange[] = [];
		const hitIndices = hitIndicesByClassName.get(className);
		if (hitIndices && hitIndices.size > 0) {
			const sortedHitIndices = Array.from(hitIndices).sort((a, b) => a - b);
			mergedRanges.push(...collapseContinuousIndices(sortedHitIndices));
		}
		const explicitRanges = explicitRangesByClassName.get(className);
		if (explicitRanges && explicitRanges.length > 0) {
			mergedRanges.push(...explicitRanges);
		}
		for (const range of mergeRanges(mergedRanges)) {
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

function ensureRangeList(map: Map<string, TextDetectionRange[]>, className: string): TextDetectionRange[] {
	const existing = map.get(className);
	if (existing) {
		return existing;
	}
	const next: TextDetectionRange[] = [];
	map.set(className, next);
	return next;
}

function normalizeRange(range: TextDetectionRange, docLength: number): TextDetectionRange | null {
	const from = Math.max(0, Math.min(docLength, range.from));
	const to = Math.max(0, Math.min(docLength, range.to));
	if (from >= to) {
		return null;
	}
	return { from, to };
}

function collapseContinuousIndices(sortedIndices: number[]): TextDetectionRange[] {
	if (sortedIndices.length === 0) {
		return [];
	}

	const ranges: TextDetectionRange[] = [];
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

function mergeRanges(ranges: TextDetectionRange[]): TextDetectionRange[] {
	if (ranges.length === 0) {
		return [];
	}

	const sortedRanges = [...ranges].sort((left, right) => left.from - right.from || left.to - right.to);
	const merged: TextDetectionRange[] = [];
	let current: TextDetectionRange | null = null;
	for (const range of sortedRanges) {
		if (!current) {
			current = { ...range };
			continue;
		}
			if (range.from < current.to) {
				current.to = Math.max(current.to, range.to);
				continue;
			}
		merged.push(current);
		current = { ...range };
	}
	if (current) {
		merged.push(current);
	}
	return merged;
}

export function createTextDetectionExtension(rules: TextDetectionRule[]) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, rules);
			}

			update(update: ViewUpdate): void {
				const forcedRefresh = update.transactions.some((transaction) => transaction.annotation(TEXT_DETECTION_FORCE_REFRESH));
				if (forcedRefresh || update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.decorations = buildDecorations(update.view, rules);
				}
			}
		},
		{
			decorations: (value) => value.decorations,
		},
	);
}

export function createTextDetectionForceRefreshTransaction(): { annotations: Annotation<boolean> } {
	return {
		annotations: TEXT_DETECTION_FORCE_REFRESH.of(true),
	};
}
