import { Editor, MarkdownView, Notice, type Plugin } from "obsidian";
import { resolveAnnotationCustomTypes, type PluginContext, type SettingDatas } from "../../core";
import { normalizeVaultPath } from "../../core/novel-library-service";
import { resolveEditorViewFromMarkdownView } from "../../utils";
import {
	getAnnotationColorTypes,
	type AnnotationColorType,
	resolveAnnotationTypeTitle,
} from "../annotation/color-types";
import { emitAnnotationCreated } from "../annotation/flash-bus";
import { getAnnotationRepository, type AnnotationRepository, type AnnotationSelectionAnchor } from "../annotation/repository";

const TOGGLE_ANNOTATION_FEATURE_COMMAND_ID = "toggle-annotation-feature";
const CREATE_ANNOTATION_COMMAND_ID_PREFIX = "create-annotation-";

export function registerAnnotationCommands(plugin: Plugin, ctx: PluginContext): void {
	const repository = getAnnotationRepository(ctx.app);

	plugin.addCommand({
		id: TOGGLE_ANNOTATION_FEATURE_COMMAND_ID,
		name: ctx.t("command.annotation.toggle.name"),
		callback: () => {
			void runToggleAnnotationCommand(ctx);
		},
	});

	let dynamicCommandIds = registerAnnotationTypeCreateCommands(plugin, ctx, repository);
	const disposeSettingsChange = ctx.onSettingsChange((next, prev) => {
		if (!shouldRefreshAnnotationTypeCommands(next, prev)) {
			return;
		}
		removeCommands(plugin, dynamicCommandIds);
		dynamicCommandIds = registerAnnotationTypeCreateCommands(plugin, ctx, repository);
	});
	plugin.register(disposeSettingsChange);
	plugin.register(() => {
		removeCommands(plugin, dynamicCommandIds);
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
	const rawSuffix = type.key;
	const normalized = rawSuffix
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized.length > 0 ? normalized : type.colorHex.replace("#", "").toLowerCase();
}

function registerAnnotationTypeCreateCommands(
	plugin: Plugin,
	ctx: PluginContext,
	repository: AnnotationRepository,
): string[] {
	const commandIds: string[] = [];
	for (const annotationType of getAnnotationColorTypes(ctx.settings)) {
		const commandId = `${CREATE_ANNOTATION_COMMAND_ID_PREFIX}${resolveAnnotationTypeCommandSuffix(annotationType)}`;
		commandIds.push(commandId);
		plugin.addCommand({
			id: commandId,
			name: `${ctx.t("command.annotation.create.name")}${resolveAnnotationTypeTitle(annotationType, (key) => ctx.t(key))}`,
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
	return commandIds;
}

function removeCommands(plugin: Plugin, commandIds: readonly string[]): void {
	for (const commandId of commandIds) {
		plugin.removeCommand(commandId);
	}
}

function shouldRefreshAnnotationTypeCommands(
	next: Readonly<SettingDatas>,
	prev: Readonly<SettingDatas>,
): boolean {
	if (next.locale !== prev.locale) {
		return true;
	}
	return !areAnnotationTypeSettingsEqual(next.annotationCustomTypes, prev.annotationCustomTypes);
}

function areAnnotationTypeSettingsEqual(leftRaw: unknown, rightRaw: unknown): boolean {
	const left = resolveAnnotationCustomTypes(leftRaw);
	const right = resolveAnnotationCustomTypes(rightRaw);
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		const leftItem = left[index];
		const rightItem = right[index];
		if (!leftItem || !rightItem) {
			return false;
		}
		if (
			leftItem.key !== rightItem.key ||
			leftItem.label !== rightItem.label ||
			leftItem.colorHex !== rightItem.colorHex
		) {
			return false;
		}
	}
	return true;
}
