import { Plugin } from "obsidian";
import {
	createPluginContext,
	type ContextHost,
	type PluginContext,
} from "./core/context";
import { normalizeLocale } from "./lang";
import {
	createDefaultSettings,
	type ChineseNovelAssistantSettings,
	DEFAULT_SETTINGS,
} from "./settings/settings";
import { registerCharacterCountFeature } from "./features/character-count";
import { registerNovelSubdirVisibilityFeature } from "./features/novel-subdir-visibility";
import { registerTextDetectionFeature } from "./features/text-detection";
import { registerTypesetFeature } from "./features/typeset";
import { ChineseNovelAssistantSettingTab } from "./ui/views/settings-tab";
import type { SettingsChangeListener } from "./core/context";

export default class ChineseNovelAssistantPlugin extends Plugin {
	private settings: ChineseNovelAssistantSettings = DEFAULT_SETTINGS;
	private ctx: PluginContext | null = null;
	private settingsChangeListeners = new Set<SettingsChangeListener>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.ctx = createPluginContext(this.createContextHost());
		this.ctx.addSettingTab(new ChineseNovelAssistantSettingTab(this.app, this, this.ctx));
		registerNovelSubdirVisibilityFeature(this, this.ctx);
		registerCharacterCountFeature(this, this.ctx);
		registerTextDetectionFeature(this, this.ctx);
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
		const loaded = (await this.loadData()) as Partial<ChineseNovelAssistantSettings> | null;
		const defaults = createDefaultSettings(appLocale);
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
