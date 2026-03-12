import { Plugin } from "obsidian";
import {
	createPluginContext,
	type ContextHost,
	type PluginContext,
} from "./core/context";
import { normalizeLocale } from "./lang";
import {
	createDefaultSettings,
	type SettingDatas,
} from "./core/setting-datas";
import { registerCharacterCountFeature } from "./features/character-count";
import { registerCommandsFeature } from "./features/commands";
import { registerTextDetectionFeature } from "./features/text-detection";
import { registerTextAutocompleteFeature } from "./features/text-autocomplete";
import { registerTypesetFeature } from "./features/typeset";
import { registerSidebarFeature } from "./features/sidebar";
import { registerNovelLibraryFeature } from "./features/novel-library";
import { ChineseNovelAssistantSettingTab } from "./ui/views/settings-tabs/settings-tab";
import type { SettingsChangeListener } from "./core/context";

export default class ChineseNovelAssistantPlugin extends Plugin {
	private settings: SettingDatas = createDefaultSettings();
	private ctx: PluginContext | null = null;
	private settingsChangeListeners = new Set<SettingsChangeListener>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.ctx = createPluginContext(this.createContextHost());

		// 界面
		this.ctx.addSettingTab(new ChineseNovelAssistantSettingTab(this.app, this, this.ctx));
		registerSidebarFeature(this, this.ctx);
		
		// 功能
		registerNovelLibraryFeature(this, this.ctx);
		registerCommandsFeature(this, this.ctx);
		registerCharacterCountFeature(this, this.ctx);
		registerTextDetectionFeature(this, this.ctx);
		registerTextAutocompleteFeature(this, this.ctx);
		registerTypesetFeature(this, this.ctx);
	}

	private createContextHost(): ContextHost {
		return {
			app: this.app,
			addSettingTab: (tab) => this.addSettingTab(tab),
			getSettings: () => this.settings,
			saveSettings: async (nextSettings) => {
				this.settings = nextSettings;
				await this.saveData(this.settings);
				for (const listener of this.settingsChangeListeners) {
					listener(this.settings);
				}
			},
			onSettingsChange: (listener) => {
				this.settingsChangeListeners.add(listener);
				return () => {
					this.settingsChangeListeners.delete(listener);
				};
			},
		};
	}

	private async loadSettings(): Promise<void> {
		const rawLocale = this.getRuntimeLocale();
		const appLocale = normalizeLocale(typeof rawLocale === "string" ? rawLocale : null);
		const loaded = (await this.loadData()) as Partial<SettingDatas> | null;
		const defaults = createDefaultSettings();
		defaults.locale = appLocale;
		this.settings = Object.assign({}, defaults, loaded ?? {});
		this.settings.locale = normalizeLocale(this.settings.locale);
	}

	private getRuntimeLocale(): string | null {
		const appWithLocale = this.app as typeof this.app & { locale?: unknown };
		if (typeof appWithLocale.locale === "string" && appWithLocale.locale.length > 0) {
			return appWithLocale.locale;
		}

		if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
			return navigator.language;
		}

		return null;
	}
}


