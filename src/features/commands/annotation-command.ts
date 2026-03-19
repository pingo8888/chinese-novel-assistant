import { Editor, MarkdownView, Notice, type Plugin } from "obsidian";
import { type PluginContext } from "../../core";
import { normalizeVaultPath } from "../../core/novel-library-service";
import { resolveEditorViewFromMarkdownView } from "../../utils";
import { ANNOTATION_COLOR_TYPES, type AnnotationColorType } from "../annotation/color-types";
import { emitAnnotationCreated } from "../annotation/flash-bus";
import { AnnotationRepository, type AnnotationSelectionAnchor } from "../annotation/repository";

export function registerAnnotationCommands(plugin: Plugin, ctx: PluginContext): void {
	const repository = new AnnotationRepository(ctx.app);

	plugin.addCommand({
		id: "toggle-annotation-feature",
		name: ctx.t("command.annotation.toggle.name"),
		callback: () => {
			void runToggleAnnotationCommand(ctx);
		},
	});

	for (const annotationType of ANNOTATION_COLOR_TYPES) {
		plugin.addCommand({
			id: `create-annotation-${resolveAnnotationTypeCommandSuffix(annotationType)}`,
			name: `${ctx.t("command.annotation.create.name")}${ctx.t(annotationType.labelKey)}`,
			checkCallback: (checking) => {
				if (!ctx.settings.annotationEnabled) {
					return false;
				}
				const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView?.editor) {
					return false;
				}
				if (checking) {
					return true;
				}
				void runCreateAnnotationCommand(ctx, repository, annotationType.colorHex);
				return true;
			},
		});
	}
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

async function runCreateAnnotationCommand(
	ctx: PluginContext,
	repository: AnnotationRepository,
	colorHex: string,
): Promise<void> {
	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView?.editor || !activeView.file?.path) {
		new Notice(ctx.t("command.annotation.create.no_active_editor"));
		return;
	}
	const sourcePath = activeView.file.path;
	if (!repository.isManagedSourceFile(ctx.settings, sourcePath)) {
		new Notice(ctx.t("command.annotation.create.out_of_scope"));
		return;
	}
	const selection = resolveSelectionAnchor(activeView.editor, activeView);
	if (!selection) {
		new Notice(ctx.t("command.annotation.create.no_selection"));
		return;
	}

	try {
		const createdCard = await repository.createEntryAtSelection(
			ctx.settings,
			sourcePath,
			selection,
			ctx.t("feature.annotation.default_title"),
			colorHex,
		);
		emitAnnotationCreated({
			sourcePath: normalizeVaultPath(createdCard.sourcePath),
			annotationPath: normalizeVaultPath(createdCard.annoPath),
			annotationId: createdCard.id,
		});
		new Notice(ctx.t("command.annotation.create.done"));
	} catch (error) {
		console.error("[Chinese Novel Assistant] Failed to create annotation via command.", error);
		new Notice(ctx.t("command.annotation.create.failed"));
	}
}

function resolveSelectionAnchor(editor: Editor, view: MarkdownView): AnnotationSelectionAnchor | null {
	const editorView = resolveEditorViewFromMarkdownView(view);
	const mainSelection = editorView?.state.selection.main;
	if (mainSelection && !mainSelection.empty) {
		const fromOffset = Math.max(0, Math.round(mainSelection.from));
		const toOffset = Math.max(0, Math.round(mainSelection.to));
		const fromPos = editor.offsetToPos(fromOffset);
		return {
			line: Math.max(0, fromPos.line),
			ch: Math.max(0, fromPos.ch),
			fromOffset,
			toOffset,
		};
	}

	const fromPos = editor.getCursor("from");
	const toPos = editor.getCursor("to");
	const fromOffset = Math.max(0, editor.posToOffset(fromPos));
	const toOffset = Math.max(0, editor.posToOffset(toPos));
	if (toOffset <= fromOffset) {
		return null;
	}
	return {
		line: Math.max(0, fromPos.line),
		ch: Math.max(0, fromPos.ch),
		fromOffset,
		toOffset,
	};
}

function resolveAnnotationTypeCommandSuffix(type: AnnotationColorType): string {
	const rawSuffix = type.labelKey.split(".").pop() ?? type.colorHex;
	const normalized = rawSuffix
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized.length > 0 ? normalized : type.colorHex.replace("#", "").toLowerCase();
}
