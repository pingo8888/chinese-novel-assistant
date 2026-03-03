import type { SupportedLocale } from "../lang";
import { translate } from "../lang";

export interface ChineseNovelAssistantSettings {
	enabled: boolean;
	defaultNoteText: string;
	locale: SupportedLocale;
}

export function createDefaultSettings(locale: SupportedLocale): ChineseNovelAssistantSettings {
	return {
		enabled: true,
		defaultNoteText: translate(locale, "notice.prototype_loaded"),
		locale,
	};
}

export const DEFAULT_SETTINGS: ChineseNovelAssistantSettings = createDefaultSettings("zh_cn");
