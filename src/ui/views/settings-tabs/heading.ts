import { Setting } from "obsidian";

export function createSettingsSectionHeading(containerEl: HTMLElement, text: string): void {
	const headingSetting = new Setting(containerEl).setName(text).setHeading();
	headingSetting.settingEl.addClass("cna-settings-section-title");
}
