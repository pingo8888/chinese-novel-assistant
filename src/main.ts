import { Plugin } from "obsidian";
import { normalizeLocale } from "./lang";
import {
	createPluginContext,
	type ContextHost,
	type PluginContext,
} from "./core/context";

import {
	createDefaultSettings,
	type SettingDatas,
} from "./core/setting-datas";
import { SettingStore } from "./core/setting-store";
// 界面相关
import { CNASettingTab } from "./ui/views/settings-tabs/settings-tab";
import { registerSidebarFeature } from "./features/sidebar";
// 功能相关
import { registerCharacterCountFeature } from "./features/character-count";
import { registerCommandsFeature } from "./features/commands";
import { registerTextDetectionFeature } from "./features/text-detection";
import { registerTextAutocompleteFeature } from "./features/text-autocomplete";
import { registerTypesetFeature } from "./features/typeset";
import { registerNovelLibraryFeature } from "./features/novel-library";

export default class CNAPlugin extends Plugin {
	private settingStore = new SettingStore(this);
	private ctx: PluginContext | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.ctx = createPluginContext(this.createContextHost());

		// 注册界面
		this.ctx.addSettingTab(new CNASettingTab(this.app, this, this.ctx));
		registerSidebarFeature(this, this.ctx);
		
		// 注册功能
		registerNovelLibraryFeature(this, this.ctx);
		registerCommandsFeature(this, this.ctx);
		registerCharacterCountFeature(this, this.ctx);
		registerTextDetectionFeature(this, this.ctx);
		registerTextAutocompleteFeature(this, this.ctx);
		registerTypesetFeature(this, this.ctx);
	}

	// 初始化ContextHost
	private createContextHost(): ContextHost {
		return {
			app: this.app,
			addSettingTab: (tab) => this.addSettingTab(tab),
			settingStore: this.settingStore,
		};
	}

	// 加载设置数据
	private async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<SettingDatas> | null;
		const defaults = createDefaultSettings();
		const merged = Object.assign({}, defaults, loaded ?? {});
		merged.locale = normalizeLocale(merged.locale);
		this.settingStore.patch(merged);
		this.settingStore.notify();
	}
}
