import type { SettingDatas } from "../../core";
import {
	type ResolvedCustomTypeOption,
	resolveAnnotationDefaultColor,
	resolveAnnotationTypeOptions,
	resolveTypeOptionTitle,
} from "../../core";
import type { TranslationKey } from "../../lang";
import { parseColorHex } from "../../utils";

export type AnnotationColorType = ResolvedCustomTypeOption;

export const DEFAULT_ANNOTATION_COLOR = resolveAnnotationDefaultColor(undefined);
const DEFAULT_ANNOTATION_TYPE_FALLBACK: AnnotationColorType = {
	key: "pending",
	label: "",
	labelKey: "feature.annotation.type.pending",
	colorHex: DEFAULT_ANNOTATION_COLOR,
};

export function getAnnotationColorTypes(settings: Pick<SettingDatas, "annotationCustomTypes">): AnnotationColorType[] {
	return resolveAnnotationTypeOptions(settings.annotationCustomTypes);
}

export function resolveAnnotationTypeTitle(
	option: Pick<AnnotationColorType, "label" | "labelKey">,
	translate: (key: TranslationKey) => string,
): string {
	return resolveTypeOptionTitle(option, translate);
}

export function resolveAnnotationTypeByColorHex(
	settings: Pick<SettingDatas, "annotationCustomTypes">,
	value: string | null | undefined,
): AnnotationColorType {
	const types = getAnnotationColorTypes(settings);
	const normalized = normalizeAnnotationColorHex(value, resolveAnnotationDefaultColor(settings.annotationCustomTypes));
	const matched = types.find((option) => option.colorHex.toUpperCase() === normalized.toUpperCase());
	if (matched) {
		return matched;
	}
	return types[types.length - 1] ?? DEFAULT_ANNOTATION_TYPE_FALLBACK;
}

export function resolveAnnotationDefaultTypeColor(settings: Pick<SettingDatas, "annotationCustomTypes">): string {
	return resolveAnnotationDefaultColor(settings.annotationCustomTypes);
}

export function normalizeAnnotationColorHex(value: string | null | undefined, fallback = DEFAULT_ANNOTATION_COLOR): string {
	return parseColorHex(value)?.toUpperCase() ?? fallback;
}
