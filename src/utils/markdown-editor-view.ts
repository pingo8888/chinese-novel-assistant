import { EditorView } from "@codemirror/view";
import { type App, MarkdownView, type WorkspaceLeaf } from "obsidian";

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

export function resolveMarkdownLeafByFilePath(app: App, filePath: string): WorkspaceLeaf | null {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		if (!(leaf.view instanceof MarkdownView)) {
			continue;
		}
		if (leaf.view.file?.path === filePath) {
			return leaf;
		}
	}
	return null;
}

export function resolveMarkdownViewByFilePath(app: App, filePath: string): MarkdownView | null {
	const leaf = resolveMarkdownLeafByFilePath(app, filePath);
	if (!leaf || !(leaf.view instanceof MarkdownView)) {
		return null;
	}
	return leaf.view;
}

export async function openMarkdownFileWithoutDuplicate(
	app: App,
	filePath: string,
	openInNewTab = false,
): Promise<MarkdownView | null> {
	const existingLeaf = resolveMarkdownLeafByFilePath(app, filePath);
	if (existingLeaf && existingLeaf.view instanceof MarkdownView) {
		app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		return existingLeaf.view;
	}

	await app.workspace.openLinkText(filePath, filePath, openInNewTab);
	const openedLeaf = resolveMarkdownLeafByFilePath(app, filePath);
	if (!openedLeaf || !(openedLeaf.view instanceof MarkdownView)) {
		return null;
	}
	app.workspace.setActiveLeaf(openedLeaf, { focus: true });
	return openedLeaf.view;
}

export function resolveFilePathByEditorView(app: App, editorView: ResolvedEditorView): string | null {
	const markdownView = resolveMarkdownViewByEditorView(app, editorView);
	return markdownView?.file?.path ?? null;
}

