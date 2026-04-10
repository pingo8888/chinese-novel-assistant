import type { TranslationKey } from "../lang";
import { isRecord, parseColorHex } from "../utils";
import { STICKY_NOTE_COLORS } from "./constants";

export type CustomTypeKey =
	| "summary"
	| "foreshadow"
	| "memo"
	| "side_story"
	| "bookmark"
	| "comment"
	| "pending";

export interface CustomTypeSettingItem {
	key: CustomTypeKey;
	label: string;
	colorHex: string;
}

export interface ResolvedCustomTypeOption extends CustomTypeSettingItem {
	labelKey: TranslationKey;
}

interface TypeLabelDefinition {
	key: CustomTypeKey;
	labelKey: TranslationKey;
}

const TYPE_LABEL_DEFINITIONS: readonly TypeLabelDefinition[] = [
	{ key: "summary", labelKey: "feature.annotation.type.summary" },
	{ key: "foreshadow", labelKey: "feature.annotation.type.foreshadow" },
	{ key: "memo", labelKey: "feature.annotation.type.memo" },
	{ key: "side_story", labelKey: "feature.annotation.type.side_story" },
	{ key: "bookmark", labelKey: "feature.annotation.type.bookmark" },
	{ key: "comment", labelKey: "feature.annotation.type.comment" },
	{ key: "pending", labelKey: "feature.annotation.type.pending" },
];

const TIMELINE_TYPE_LABEL_DEFINITIONS: readonly TypeLabelDefinition[] = [
	{ key: "summary", labelKey: "feature.timeline.type.summary" },
	{ key: "foreshadow", labelKey: "feature.timeline.type.foreshadow" },
	{ key: "memo", labelKey: "feature.timeline.type.memo" },
	{ key: "side_story", labelKey: "feature.timeline.type.side_story" },
	{ key: "bookmark", labelKey: "feature.timeline.type.bookmark" },
	{ key: "comment", labelKey: "feature.timeline.type.comment" },
	{ key: "pending", labelKey: "feature.timeline.type.pending" },
];

const DEFAULT_COLORS = STICKY_NOTE_COLORS as readonly string[];

export const DEFAULT_STICKY_NOTE_CUSTOM_COLORS: readonly string[] = [...DEFAULT_COLORS];

export const DEFAULT_ANNOTATION_CUSTOM_TYPES: readonly CustomTypeSettingItem[] = TYPE_LABEL_DEFINITIONS.map((definition, index) => ({
	key: definition.key,
	label: "",
	colorHex: DEFAULT_COLORS[index] ?? "#9CA3AF",
}));

export const DEFAULT_TIMELINE_CUSTOM_TYPES: readonly CustomTypeSettingItem[] = TIMELINE_TYPE_LABEL_DEFINITIONS.map((definition, index) => ({
	key: definition.key,
	label: "",
	colorHex: DEFAULT_COLORS[index] ?? "#9CA3AF",
}));

export function resolveStickyNoteCustomColors(rawValue: unknown): string[] {
	const raw = Array.isArray(rawValue) ? rawValue : [];
	return DEFAULT_STICKY_NOTE_CUSTOM_COLORS.map((defaultColor, index) => {
		const candidate = normalizeColorHex(raw[index]);
		return candidate ?? defaultColor;
	});
}

export function resolveAnnotationCustomTypes(rawValue: unknown): CustomTypeSettingItem[] {
	return resolveCustomTypes(rawValue, DEFAULT_ANNOTATION_CUSTOM_TYPES);
}

export function resolveTimelineCustomTypes(rawValue: unknown): CustomTypeSettingItem[] {
	return resolveCustomTypes(rawValue, DEFAULT_TIMELINE_CUSTOM_TYPES);
}

export function resolveAnnotationTypeOptions(rawValue: unknown): ResolvedCustomTypeOption[] {
	const customTypes = resolveAnnotationCustomTypes(rawValue);
	return customTypes.map((item, index) => ({
		...item,
		labelKey: TYPE_LABEL_DEFINITIONS[index]?.labelKey ?? TYPE_LABEL_DEFINITIONS[TYPE_LABEL_DEFINITIONS.length - 1]!.labelKey,
	}));
}

export function resolveTimelineTypeOptions(rawValue: unknown): ResolvedCustomTypeOption[] {
	const customTypes = resolveTimelineCustomTypes(rawValue);
	return customTypes.map((item, index) => ({
		...item,
		labelKey: TIMELINE_TYPE_LABEL_DEFINITIONS[index]?.labelKey
			?? TIMELINE_TYPE_LABEL_DEFINITIONS[TIMELINE_TYPE_LABEL_DEFINITIONS.length - 1]!.labelKey,
	}));
}

export function resolveTypeOptionTitle(
	option: Pick<ResolvedCustomTypeOption, "label" | "labelKey">,
	translate: (key: TranslationKey) => string,
): string {
	const customLabel = option.label.trim();
	return customLabel.length > 0 ? customLabel : translate(option.labelKey);
}

export function resolveAnnotationDefaultColor(rawValue: unknown): string {
	const options = resolveAnnotationCustomTypes(rawValue);
	return options[options.length - 1]?.colorHex ?? "#9CA3AF";
}

export function resolveTimelineDefaultColor(rawValue: unknown): string {
	const options = resolveTimelineCustomTypes(rawValue);
	return options[options.length - 1]?.colorHex ?? "#9CA3AF";
}

export function hasTypeColorChanged(
	previousTypes: readonly CustomTypeSettingItem[],
	nextTypes: readonly CustomTypeSettingItem[],
): boolean {
	const length = Math.max(previousTypes.length, nextTypes.length);
	for (let index = 0; index < length; index += 1) {
		const previous = previousTypes[index];
		const next = nextTypes[index];
		if (!previous || !next) {
			return true;
		}
		if (previous.key !== next.key || previous.colorHex !== next.colorHex) {
			return true;
		}
	}
	return false;
}

export function resolveMappedTypeColor(
	currentColor: string | undefined,
	previousTypes: readonly CustomTypeSettingItem[],
	nextTypes: readonly CustomTypeSettingItem[],
): string | null {
	const normalizedCurrentColor = normalizeColorHex(currentColor);
	if (!normalizedCurrentColor) {
		return null;
	}
	for (let index = 0; index < previousTypes.length; index += 1) {
		const previous = previousTypes[index];
		if (!previous || previous.colorHex.toUpperCase() !== normalizedCurrentColor) {
			continue;
		}
		const next = nextTypes[index];
		return next?.colorHex ?? null;
	}
	return null;
}

export function updateCustomTypeSettings(
	current: unknown,
	key: string,
	resolver: (rawValue: unknown) => CustomTypeSettingItem[],
	mutator: (item: CustomTypeSettingItem) => void,
): CustomTypeSettingItem[] {
	const next = resolver(current);
	const target = next.find((item) => item.key === key);
	if (!target) {
		return next;
	}
	mutator(target);
	return next;
}

function resolveCustomTypes(rawValue: unknown, defaults: readonly CustomTypeSettingItem[]): CustomTypeSettingItem[] {
	const raw = Array.isArray(rawValue) ? rawValue : [];
	const rawByKey = new Map<CustomTypeKey, unknown>();
	for (const item of raw) {
		if (!isRecord(item)) {
			continue;
		}
		const key = parseCustomTypeKey(item["key"]);
		if (!key || rawByKey.has(key)) {
			continue;
		}
		rawByKey.set(key, item);
	}

	const resolved: CustomTypeSettingItem[] = [];
	for (let index = 0; index < defaults.length; index += 1) {
		const fallback = defaults[index];
		if (!fallback) {
			continue;
		}
		const rawByKeyItem = rawByKey.get(fallback.key);
		const rawByIndexItem = raw[index];
		const rawItem = isRecord(rawByKeyItem)
			? rawByKeyItem
			: (isRecord(rawByIndexItem) ? rawByIndexItem : null);
		const label = rawItem && typeof rawItem["label"] === "string"
			? rawItem["label"].trim()
			: fallback.label;
		const colorHex = rawItem
			? (normalizeColorHex(rawItem["colorHex"]) ?? fallback.colorHex)
			: fallback.colorHex;
		resolved.push({
			key: fallback.key,
			label,
			colorHex,
		});
	}
	return resolved;
}

function normalizeColorHex(value: unknown): string | undefined {
	const parsed = parseColorHex(value);
	return parsed ? parsed.toUpperCase() : undefined;
}

function parseCustomTypeKey(value: unknown): CustomTypeKey | null {
	switch (value) {
		case "summary":
		case "foreshadow":
		case "memo":
		case "side_story":
		case "bookmark":
		case "comment":
		case "pending":
			return value;
		default:
			return null;
	}
}
