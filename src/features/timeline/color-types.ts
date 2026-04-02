import type { TranslationKey } from "../../lang";

export interface TimelineColorType {
	colorHex: string;
	labelKey: TranslationKey;
}

export const TIMELINE_COLOR_TYPES: readonly TimelineColorType[] = [
	{ colorHex: "#4A86E9", labelKey: "feature.timeline.type.summary" },
	{ colorHex: "#7B61FF", labelKey: "feature.timeline.type.foreshadow" },
	{ colorHex: "#47B881", labelKey: "feature.timeline.type.memo" },
	{ colorHex: "#F6C445", labelKey: "feature.timeline.type.side_story" },
	{ colorHex: "#F59E0B", labelKey: "feature.timeline.type.bookmark" },
	{ colorHex: "#F05D6C", labelKey: "feature.timeline.type.comment" },
	{ colorHex: "#9CA3AF", labelKey: "feature.timeline.type.pending" },
];

export const TIMELINE_DEFAULT_COLOR = TIMELINE_COLOR_TYPES[TIMELINE_COLOR_TYPES.length - 1]?.colorHex ?? "#9CA3AF";
