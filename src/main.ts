import { Plugin } from "obsidian";
import {
	createPluginContext,
	type ContextHost,
	type PluginContext,
} from "./core/context";
import { registerPrototypeCommand } from "./features/prototype/commands";
import { normalizeLocale } from "./lang";
import {
	createDefaultSettings,
	type ChineseNovelAssistantSettings,
	DEFAULT_SETTINGS,
} from "./settings/settings";
import { ChineseNovelAssistantSettingTab } from "./ui/views/settings-tab";

export default class ChineseNovelAssistantPlugin extends Plugin {
	private settings: ChineseNovelAssistantSettings = DEFAULT_SETTINGS;
	private ctx: PluginContext | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.ctx = createPluginContext(this.createContextHost());
		registerPrototypeCommand(this.ctx);
		this.ctx.addSettingTab(new ChineseNovelAssistantSettingTab(this.app, this, this.ctx));
	}

	private createContextHost(): ContextHost {
		return {
			app: this.app,
			addCommand: (command) => this.addCommand(command),
			addSettingTab: (tab) => this.addSettingTab(tab),
			getSettings: () => this.settings,
			saveSettings: async (nextSettings) => {
				this.settings = nextSettings;
				await this.saveData(this.settings);
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
		if (!this.settings.defaultNoteText) {
			this.settings.defaultNoteText = defaults.defaultNoteText;
		}
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
