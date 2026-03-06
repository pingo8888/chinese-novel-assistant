import type { TranslationKey } from "../../../lang";
import type { App } from "obsidian";
import type { SettingsChangeListener } from "../../../core/context";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import type { GuidebookTreeData } from "../../../features/guidebook/tree-builder";

export interface SidebarViewRenderContext {
	app: App;
	t: (key: TranslationKey) => string;
	getSettings: () => ChineseNovelAssistantSettings;
	onSettingsChange?: (listener: SettingsChangeListener) => () => void;
	loadGuidebookTreeData?: (activeFilePath: string | null) => Promise<GuidebookTreeData | null>;
}

export type SidebarViewRenderer = (containerEl: HTMLElement, ctx: SidebarViewRenderContext) => void | (() => void);
