import type { TranslationKey } from "../../../lang";
import type { App } from "obsidian";
import type { SettingsChangeListener } from "../../../core/context";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";

export interface RightSidebarViewRenderContext {
	app: App;
	t: (key: TranslationKey) => string;
	getSettings: () => ChineseNovelAssistantSettings;
	onSettingsChange?: (listener: SettingsChangeListener) => () => void;
}

export type RightSidebarViewRenderer = (containerEl: HTMLElement, ctx: RightSidebarViewRenderContext) => void | (() => void);
