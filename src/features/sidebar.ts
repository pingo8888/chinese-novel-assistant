import type { Plugin } from "obsidian";
import { type PluginContext } from "../core";
import {
	detachStickyNoteSidebars,
	openStickyNoteSidebar,
	syncStickyNoteSidebarWithGuidebook,
} from "./sticky-note";
import {
	detachAnnotationSidebars,
	openAnnotationSidebar,
	syncAnnotationSidebarWithGuidebook,
} from "./annotation";
import {
	detachTimelineSidebars,
	openTimelineSidebar,
	syncTimelineSidebarWithGuidebook,
} from "./timeline";

export function registerSidebarFeature(plugin: Plugin, ctx: PluginContext): void {
	plugin.app.workspace.onLayoutReady(() => {
		void openGuidebookSidebarWithStickyNote(plugin, ctx);
	});

	let lastStickyNoteEnabled = ctx.settings.stickyNoteEnabled;
	let lastAnnotationEnabled = ctx.settings.annotationEnabled;
	let lastTimelineEnabled = ctx.settings.timelineEnabled;
	const unsubscribeSettingsChange = ctx.onSettingsChange((settings) => {
		const nextStickyNoteEnabled = settings.stickyNoteEnabled;
		const nextAnnotationEnabled = settings.annotationEnabled;
		const nextTimelineEnabled = settings.timelineEnabled;

		if (nextStickyNoteEnabled !== lastStickyNoteEnabled) {
			lastStickyNoteEnabled = nextStickyNoteEnabled;
			if (nextStickyNoteEnabled) {
				void openStickyNoteSidebar(plugin, true);
			} else {
				detachStickyNoteSidebars(plugin);
				void openGuidebookSidebarWithStickyNote(plugin, ctx);
			}
		}

		if (nextAnnotationEnabled !== lastAnnotationEnabled) {
			lastAnnotationEnabled = nextAnnotationEnabled;
			if (nextAnnotationEnabled) {
				void openAnnotationSidebar(plugin, true);
			} else {
				detachAnnotationSidebars(plugin);
				void openGuidebookSidebarWithStickyNote(plugin, ctx);
			}
		}

		if (nextTimelineEnabled !== lastTimelineEnabled) {
			lastTimelineEnabled = nextTimelineEnabled;
			if (nextTimelineEnabled) {
				void openTimelineSidebar(plugin, true);
			} else {
				detachTimelineSidebars(plugin);
				void openGuidebookSidebarWithStickyNote(plugin, ctx);
			}
		}
	});
	plugin.register(unsubscribeSettingsChange);
	plugin.register(() => {
		detachSidebarViews(plugin);
	});
}

export async function openGuidebookSidebarWithStickyNote(
	plugin: Plugin,
	ctx: PluginContext,
): Promise<void> {
	const guidebookLeaf = await plugin.app.workspace.ensureSideLeaf(
		"guidebook-sidebar",
		"right",
		{
			active: true,
			reveal: true,
			split: false,
		},
	);

	await syncStickyNoteSidebarWithGuidebook(plugin, ctx, guidebookLeaf);
	await syncAnnotationSidebarWithGuidebook(plugin, ctx, guidebookLeaf);
	await syncTimelineSidebarWithGuidebook(plugin, ctx, guidebookLeaf);
	plugin.app.workspace.setActiveLeaf(guidebookLeaf, {
		focus: true,
	});
}

function detachSidebarViews(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType("guidebook-sidebar")) {
		leaf.detach();
	}
	detachStickyNoteSidebars(plugin);
	detachAnnotationSidebars(plugin);
	detachTimelineSidebars(plugin);
}
