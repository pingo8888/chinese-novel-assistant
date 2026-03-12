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
import { SettingStore } from "./core/setting-store";
import { registerCharacterCountFeature } from "./features/character-count";
import { registerCommandsFeature } from "./features/commands";
import { registerTextDetectionFeature } from "./features/text-detection";
import { registerTextAutocompleteFeature } from "./features/text-autocomplete";
import { registerTypesetFeature } from "./features/typeset";
import { registerSidebarFeature } from "./features/sidebar";
import { registerNovelLibraryFeature } from "./features/novel-library";
import { ChineseNovelAssistantSettingTab } from "./ui/views/settings-tabs/settings-tab";

export default class ChineseNovelAssistantPlugin extends Plugin {
	private settingStore = new SettingStore(this);
	private ctx: PluginContext | null = null;

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
			getSettings: () => this.settingStore.data,
			saveSettings: async (nextSettings) => {
				this.settingStore.patch(nextSettings);
				await this.settingStore.saveAndNotify();
			},
			onSettingsChange: (listener) => {
				return this.settingStore.subscribe((next) => {
					listener(next);
				});
			},
		};
	}

	private async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<SettingDatas> | null;
		const defaults = createDefaultSettings();
		const merged = Object.assign({}, defaults, loaded ?? {});
		merged.locale = normalizeLocale(merged.locale);
		this.settingStore.patch(merged);
		this.settingStore.notify();
	}
}


