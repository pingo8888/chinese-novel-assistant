import type { TranslationKey } from "../../lang";

export interface AnnotationColorType {
	colorHex: string;
	labelKey: TranslationKey;
}

export const ANNOTATION_COLOR_TYPES: readonly AnnotationColorType[] = [
	{ colorHex: "#4A86E9", labelKey: "feature.annotation.type.summary" },
	{ colorHex: "#7B61FF", labelKey: "feature.annotation.type.foreshadow" },
	{ colorHex: "#47B881", labelKey: "feature.annotation.type.memo" },
	{ colorHex: "#F6C445", labelKey: "feature.annotation.type.side_story" },
	{ colorHex: "#F59E0B", labelKey: "feature.annotation.type.bookmark" },
	{ colorHex: "#F05D6C", labelKey: "feature.annotation.type.comment" },
	{ colorHex: "#9CA3AF", labelKey: "feature.annotation.type.pending" },
];

export const DEFAULT_ANNOTATION_COLOR = "#9CA3AF";

export function normalizeAnnotationColorHex(value: string | null | undefined): string {
	if (!value) {
		return DEFAULT_ANNOTATION_COLOR;
	}
	const normalized = value.trim().toUpperCase();
	for (const option of ANNOTATION_COLOR_TYPES) {
		if (option.colorHex.toUpperCase() === normalized) {
			return option.colorHex;
		}
	}
	return DEFAULT_ANNOTATION_COLOR;
}

export function resolveAnnotationTypeByColorHex(value: string | null | undefined): AnnotationColorType {
	const normalized = normalizeAnnotationColorHex(value);
	return ANNOTATION_COLOR_TYPES.find((option) => option.colorHex === normalized) ?? ANNOTATION_COLOR_TYPES[ANNOTATION_COLOR_TYPES.length - 1]!;
}
