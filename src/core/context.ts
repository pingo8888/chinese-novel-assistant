import { Notice, type App, type Command, type PluginSettingTab } from "obsidian";
import { translate, type SupportedLocale, type TranslationKey } from "../lang";
import type { ChineseNovelAssistantSettings } from "../settings/settings";

export interface ContextHost {
	app: App;
	addCommand(command: Command): void;
	addSettingTab(tab: PluginSettingTab): void;
	getSettings(): ChineseNovelAssistantSettings;
	saveSettings(nextSettings: ChineseNovelAssistantSettings): Promise<void>;
}

export interface PluginContext {
	readonly app: App;
	readonly settings: ChineseNovelAssistantSettings;
	readonly locale: SupportedLocale;
	addCommand(command: Command): void;
	addSettingTab(tab: PluginSettingTab): void;
	setSettings(patch: Partial<ChineseNovelAssistantSettings>): Promise<void>;
	t(key: TranslationKey): string;
	showNotice(message: string): void;
}

export function createPluginContext(host: ContextHost): PluginContext {
	return {
		app: host.app,
		get settings() {
			return host.getSettings();
		},
		get locale() {
			return host.getSettings().locale;
		},
		addCommand: (command) => host.addCommand(command),
		addSettingTab: (tab) => host.addSettingTab(tab),
		setSettings: async (patch) => {
			const nextSettings = { ...host.getSettings(), ...patch };
			await host.saveSettings(nextSettings);
		},
		t: (key) => translate(host.getSettings().locale, key),
		showNotice: (message) => {
			new Notice(message);
		},
	};
}
