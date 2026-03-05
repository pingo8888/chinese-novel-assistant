import type { RightSidebarViewRenderContext } from "./types";

export function renderRightSidebarGuidebookView(containerEl: HTMLElement, ctx: RightSidebarViewRenderContext): void {
	containerEl.createDiv({
		cls: "cna-right-sidebar-panel-placeholder",
		text: ctx.t("settings.tab.coming_soon"),
	});
}
