import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { SupportedLocale } from "../../lang";
import type { PluginContext } from "../../core/context";

export class ChineseNovelAssistantSettingTab extends PluginSettingTab {
	private ctx: PluginContext;

	constructor(app: App, plugin: Plugin, ctx: PluginContext) {
		super(app, plugin);
		this.ctx = ctx;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: this.ctx.t("settings.title") });

		new Setting(containerEl)
			.setName(this.ctx.t("settings.enable.name"))
			.setDesc(this.ctx.t("settings.enable.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.settings.enabled)
					.onChange(async (value) => {
						await this.ctx.setSettings({ enabled: value });
					}),
			);

		new Setting(containerEl)
			.setName(this.ctx.t("settings.notice_text.name"))
			.setDesc(this.ctx.t("settings.notice_text.desc"))
			.addText((text) =>
				text
					.setPlaceholder(this.ctx.t("settings.notice_text.placeholder"))
					.setValue(this.ctx.settings.defaultNoteText)
					.onChange(async (value) => {
						await this.ctx.setSettings({ defaultNoteText: value });
					}),
			);

		new Setting(containerEl)
			.setName(this.ctx.t("settings.language.name"))
			.setDesc(this.ctx.t("settings.language.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("zh_cn", this.ctx.t("settings.language.option.zh_cn"))
					.addOption("zh_tw", this.ctx.t("settings.language.option.zh_tw"))
					.setValue(this.ctx.locale)
					.onChange(async (value) => {
						if (!isSupportedLocale(value)) {
							return;
						}

						await this.ctx.setSettings({ locale: value });
						this.display();
					}),
			);
	}
}

function isSupportedLocale(value: string): value is SupportedLocale {
	return value === "zh_cn" || value === "zh_tw";
}
