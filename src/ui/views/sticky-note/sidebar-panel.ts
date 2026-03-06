import type { SidebarViewRenderContext } from "../guidebook/types";

export function renderStickyNoteSidebarPanel(containerEl: HTMLElement, ctx: SidebarViewRenderContext): void {
	containerEl.createDiv({
		cls: "cna-right-sidebar-panel-placeholder",
		text: ctx.t("settings.tab.coming_soon"),
	});
}
