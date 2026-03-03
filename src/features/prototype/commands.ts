import { IDS } from "../../constants";
import type { PluginContext } from "../../core/context";

export function registerPrototypeCommand(ctx: PluginContext): void {
	ctx.addCommand({
		id: IDS.command.showPrototypeNotice,
		name: ctx.t("command.show_prototype_notice"),
		callback: () => {
			if (!ctx.settings.enabled) {
				ctx.showNotice(ctx.t("notice.plugin_disabled"));
				return;
			}

			const text = ctx.settings.defaultNoteText.trim() || ctx.t("notice.prototype_loaded");
			ctx.showNotice(text);
		},
	});
}
