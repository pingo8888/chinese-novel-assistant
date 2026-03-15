import { Notice, type Plugin } from "obsidian";
import { type PluginContext } from "../../core";

export function registerAnnotationCommands(plugin: Plugin, ctx: PluginContext): void {
	plugin.addCommand({
		id: "toggle-annotation-feature",
		name: ctx.t("command.annotation.toggle.name"),
		callback: () => {
			void runToggleAnnotationCommand(ctx);
		},
	});
}

async function runToggleAnnotationCommand(ctx: PluginContext): Promise<void> {
	const nextEnabled = !ctx.settings.annotationEnabled;
	await ctx.setSettings({ annotationEnabled: nextEnabled });
	new Notice(
		nextEnabled
			? ctx.t("command.annotation.toggle.enabled")
			: ctx.t("command.annotation.toggle.disabled"),
	);
}
