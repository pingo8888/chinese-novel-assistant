import type { TranslationKey } from "../../../lang";
import type { App } from "obsidian";
import type { SettingsChangeListener } from "../../../core/context";
import type { ChineseNovelAssistantSettings } from "../../../settings/settings";
import type { GuidebookTreeData } from "../../../features/right-sidebar/guidebook-tree-builder";

export interface RightSidebarViewRenderContext {
	app: App;
	t: (key: TranslationKey) => string;
	getSettings: () => ChineseNovelAssistantSettings;
	onSettingsChange?: (listener: SettingsChangeListener) => () => void;
	loadGuidebookTreeData?: (activeFilePath: string | null) => Promise<GuidebookTreeData | null>;
}

export type RightSidebarViewRenderer = (containerEl: HTMLElement, ctx: RightSidebarViewRenderContext) => void | (() => void);
