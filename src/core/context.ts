import { type App, type PluginSettingTab } from "obsidian";
import { translate, type SupportedLocale, type TranslationKey } from "../lang";
import { NovelLibraryService } from "./novel-library-service";
import type { SettingDatas } from "./setting-datas";
import type { SettingStore, SettingsChangeListener } from "./setting-store";

export interface ContextHost {
	app: App;
	addSettingTab(tab: PluginSettingTab): void;
	settingStore: SettingStore;
}

export interface PluginContext {
	readonly app: App;
	readonly novelLibraryService: NovelLibraryService;
	readonly settings: SettingDatas;
	readonly locale: SupportedLocale;
	addSettingTab(tab: PluginSettingTab): void;
	setSettings(patch: Partial<SettingDatas>): Promise<void>;
	onSettingsChange(listener: SettingsChangeListener): () => void;
	t(key: TranslationKey): string;
}

export function createPluginContext(host: ContextHost): PluginContext {
	const novelLibraryService = new NovelLibraryService(host.app);
	return {
		app: host.app,
		novelLibraryService,
		get settings() {
			return host.settingStore.data;
		},
		get locale() {
			return host.settingStore.data.locale;
		},
		addSettingTab: (tab) => host.addSettingTab(tab),
		setSettings: async (patch) => {
			host.settingStore.patch(patch);
			await host.settingStore.saveAndNotify();
		},
		onSettingsChange: (listener) => host.settingStore.subscribe(listener),
		t: (key) => translate(host.settingStore.data.locale, key),
	};
}


