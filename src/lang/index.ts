import { LOCALE_MESSAGES } from "./locales";

export type SupportedLocale = keyof typeof LOCALE_MESSAGES;
export type TranslationKey = keyof (typeof LOCALE_MESSAGES)["zh_cn"];

export const SUPPORTED_LOCALES: SupportedLocale[] = ["zh_cn", "zh_tw"];

export function normalizeLocale(locale: string | null | undefined): SupportedLocale {
	if (!locale) {
		return "zh_cn";
	}

	const normalized = locale.toLowerCase().replace("-", "_");
	if (normalized === "zh_tw" || normalized === "zh_hk" || normalized === "zh_mo" || normalized === "zh_hant") {
		return "zh_tw";
	}

	return "zh_cn";
}

export function translate(locale: SupportedLocale, key: TranslationKey): string {
	const selected = LOCALE_MESSAGES[locale];
	return selected[key] ?? LOCALE_MESSAGES.zh_cn[key];
}
