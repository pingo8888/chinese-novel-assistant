import type { TranslationKey } from "../../../lang";

export interface RightSidebarViewRenderContext {
	t: (key: TranslationKey) => string;
}

export type RightSidebarViewRenderer = (containerEl: HTMLElement, ctx: RightSidebarViewRenderContext) => void;
