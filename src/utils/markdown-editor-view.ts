import type { EditorView } from "@codemirror/view";
import { type App, MarkdownView } from "obsidian";

export function resolveEditorViewFromMarkdownView(view: MarkdownView): EditorView | null {
	const cmHost = view as unknown as {
		editor?: {
			cm?: EditorView;
			editor?: { cm?: EditorView };
		};
		sourceMode?: {
			cmEditor?: {
				cm?: EditorView;
				editor?: { cm?: EditorView };
			};
		};
	};
	return (
		cmHost.editor?.cm ??
		cmHost.editor?.editor?.cm ??
		cmHost.sourceMode?.cmEditor?.cm ??
		cmHost.sourceMode?.cmEditor?.editor?.cm ??
		null
	);
}

export function resolveMarkdownViewByEditorView(app: App, editorView: EditorView): MarkdownView | null {
	const leaves = app.workspace.getLeavesOfType("markdown");
	for (const leaf of leaves) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			continue;
		}
		if (resolveEditorViewFromMarkdownView(view) === editorView) {
			return view;
		}
	}
	return null;
}
