import type { Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { registerProofreadCommands } from "./proofread-command";
import { registerStickyNoteCommands } from "./sticky-note-command";
import { registerTypesetCommands } from "./typeset-command";

export function registerCommandsFeature(plugin: Plugin, ctx: PluginContext): void {
	registerTypesetCommands(plugin, ctx);
	registerProofreadCommands(plugin, ctx);
	registerStickyNoteCommands(plugin, ctx);
}

