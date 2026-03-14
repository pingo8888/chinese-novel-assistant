import { EditorView } from "@codemirror/view";
import { type App, MarkdownView } from "obsidian";

type MaybeEditorView = ReturnType<typeof EditorView.findFromDOM>;
type ResolvedEditorView = NonNullable<MaybeEditorView>;

export function resolveEditorViewFromMarkdownView(view: MarkdownView): MaybeEditorView {
	const cmHost = view as unknown as {
		editor?: {
			cm?: ResolvedEditorView;
			editor?: { cm?: ResolvedEditorView };
		};
		sourceMode?: {
			cmEditor?: {
				cm?: ResolvedEditorView;
				editor?: { cm?: ResolvedEditorView };
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

export function resolveMarkdownViewByEditorView(app: App, editorView: ResolvedEditorView): MarkdownView | null {
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

export function resolveFilePathByEditorView(app: App, editorView: ResolvedEditorView): string | null {
	const markdownView = resolveMarkdownViewByEditorView(app, editorView);
	return markdownView?.file?.path ?? null;
}
