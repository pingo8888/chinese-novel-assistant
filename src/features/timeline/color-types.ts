import type { SettingDatas } from "../../core";
import {
	type ResolvedCustomTypeOption,
	resolveTimelineDefaultColor,
	resolveTimelineTypeOptions,
	resolveTypeOptionTitle,
} from "../../core";
import type { TranslationKey } from "../../lang";
import { parseColorHex } from "../../utils";

export type TimelineColorType = ResolvedCustomTypeOption;

export const TIMELINE_DEFAULT_COLOR = resolveTimelineDefaultColor(undefined);

export function getTimelineColorTypes(settings: Pick<SettingDatas, "timelineCustomTypes">): TimelineColorType[] {
	return resolveTimelineTypeOptions(settings.timelineCustomTypes);
}

export function resolveTimelineTypeTitle(
	option: Pick<TimelineColorType, "label" | "labelKey">,
	translate: (key: TranslationKey) => string,
): string {
	return resolveTypeOptionTitle(option, translate);
}

export function resolveTimelineDefaultTypeColor(settings: Pick<SettingDatas, "timelineCustomTypes">): string {
	return resolveTimelineDefaultColor(settings.timelineCustomTypes);
}

export function normalizeTimelineColorHex(value: string | null | undefined, fallback = TIMELINE_DEFAULT_COLOR): string {
	return parseColorHex(value)?.toUpperCase() ?? fallback;
}
