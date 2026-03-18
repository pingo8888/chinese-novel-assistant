import type { TextDetectionRange } from "../engine";

const FRONTMATTER_BLOCK_REGEX = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const CODE_FENCE_MARKER_REGEX = /^\s*(`{3,}|~{3,})/;

interface ActiveFenceState {
	marker: "`" | "~";
	length: number;
	startOffset: number;
}

export function collectPunctuationIgnoredRanges(docText: string): TextDetectionRange[] {
	if (!docText) {
		return [];
	}

	const ranges: TextDetectionRange[] = [];
	const frontmatterMatch = docText.match(FRONTMATTER_BLOCK_REGEX);
	if (frontmatterMatch && frontmatterMatch.index === 0 && frontmatterMatch[0].length > 0) {
		ranges.push({
			from: 0,
			to: frontmatterMatch[0].length,
		});
	}

	const fenceRanges = collectFencedCodeRanges(docText);
	if (fenceRanges.length > 0) {
		ranges.push(...fenceRanges);
	}

	const inlineCodeRanges = collectInlineCodeRanges(docText, mergeRanges(ranges));
	if (inlineCodeRanges.length > 0) {
		ranges.push(...inlineCodeRanges);
	}

	return mergeRanges(ranges);
}

export function isIndexInRanges(index: number, ranges: readonly TextDetectionRange[]): boolean {
	let left = 0;
	let right = ranges.length - 1;
	while (left <= right) {
		const middle = Math.floor((left + right) / 2);
		const range = ranges[middle];
		if (!range) {
			return false;
		}

		if (index < range.from) {
			right = middle - 1;
			continue;
		}
		if (index >= range.to) {
			left = middle + 1;
			continue;
		}
		return true;
	}
	return false;
}

function collectFencedCodeRanges(docText: string): TextDetectionRange[] {
	const ranges: TextDetectionRange[] = [];
	let activeFence: ActiveFenceState | null = null;
	let lineStart = 0;

	while (lineStart < docText.length) {
		const lineBreakIndex = docText.indexOf("\n", lineStart);
		const lineEndWithBreak = lineBreakIndex >= 0 ? lineBreakIndex + 1 : docText.length;
		const lineEndWithoutCarriageReturn =
			lineBreakIndex >= 1 && docText.charAt(lineBreakIndex - 1) === "\r"
				? lineBreakIndex - 1
				: lineEndWithBreak - (lineBreakIndex >= 0 ? 1 : 0);
		const lineText = docText.slice(lineStart, lineEndWithoutCarriageReturn);
		const fenceMatch = lineText.match(CODE_FENCE_MARKER_REGEX);

		if (activeFence) {
			if (fenceMatch && fenceMatch[1] && fenceMatch[1][0] === activeFence.marker && fenceMatch[1].length >= activeFence.length) {
				ranges.push({
					from: activeFence.startOffset,
					to: lineEndWithBreak,
				});
				activeFence = null;
			}
		} else if (fenceMatch && fenceMatch[1]) {
			activeFence = {
				marker: fenceMatch[1][0] as "`" | "~",
				length: fenceMatch[1].length,
				startOffset: lineStart,
			};
		}

		lineStart = lineEndWithBreak;
	}

	if (activeFence) {
		ranges.push({
			from: activeFence.startOffset,
			to: docText.length,
		});
	}

	return mergeRanges(ranges);
}

function collectInlineCodeRanges(
	docText: string,
	excludedRanges: readonly TextDetectionRange[],
): TextDetectionRange[] {
	const ranges: TextDetectionRange[] = [];
	let lineStart = 0;

	while (lineStart < docText.length) {
		const lineBreakIndex = docText.indexOf("\n", lineStart);
		const lineEndWithBreak = lineBreakIndex >= 0 ? lineBreakIndex + 1 : docText.length;
		const lineEnd = lineBreakIndex >= 0 ? lineBreakIndex : docText.length;
		const lineText = docText.slice(lineStart, lineEnd).replace(/\r$/, "");

		let cursor = 0;
		while (cursor < lineText.length) {
			const absoluteCursor = lineStart + cursor;
			if (lineText.charAt(cursor) !== "`" || isIndexInRanges(absoluteCursor, excludedRanges)) {
				cursor += 1;
				continue;
			}

			let openingLength = 1;
			while (cursor + openingLength < lineText.length && lineText.charAt(cursor + openingLength) === "`") {
				openingLength += 1;
			}

			let closingStart = -1;
			let search = cursor + openingLength;
			while (search < lineText.length) {
				const absoluteSearch = lineStart + search;
				if (lineText.charAt(search) !== "`" || isIndexInRanges(absoluteSearch, excludedRanges)) {
					search += 1;
					continue;
				}

				let closingLength = 1;
				while (search + closingLength < lineText.length && lineText.charAt(search + closingLength) === "`") {
					closingLength += 1;
				}
				if (closingLength === openingLength) {
					closingStart = search;
					break;
				}
				search += closingLength;
			}

			if (closingStart >= 0) {
				ranges.push({
					from: absoluteCursor,
					to: lineStart + closingStart + openingLength,
				});
				cursor = closingStart + openingLength;
				continue;
			}

			cursor += openingLength;
		}

		lineStart = lineEndWithBreak;
	}

	return mergeRanges(ranges);
}

function mergeRanges(ranges: readonly TextDetectionRange[]): TextDetectionRange[] {
	if (ranges.length === 0) {
		return [];
	}

	const sorted = [...ranges].sort((left, right) => left.from - right.from || left.to - right.to);
	const merged: TextDetectionRange[] = [];
	let current: TextDetectionRange | null = null;

	for (const range of sorted) {
		if (!current) {
			current = { ...range };
			continue;
		}
		if (range.from <= current.to) {
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
