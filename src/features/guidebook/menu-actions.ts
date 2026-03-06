import { type App, Notice, TFile } from "obsidian";
import type { TranslationKey } from "../../lang";
import type {
	GuidebookTreeData,
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
	GuidebookTreeH2Node,
} from "./tree-builder";
import { GuidebookMarkdownParser } from "./markdown-parser";
import { askForConfirmation } from "../../ui/modals/confirm-modal";
import { promptTextInput } from "../../ui/modals/text-input-modal";

export type GuidebookFileContextAction =
	| "create_collection"
	| "create_category"
	| "rename_collection"
	| "delete_collection";

export type GuidebookH1ContextAction =
	| "create_category"
	| "create_setting"
	| "rename_category"
	| "delete_category";

export type GuidebookH2ContextAction =
	| "create_setting"
	| "edit_setting"
	| "rename_setting"
	| "delete_setting";

interface GuidebookActionContext {
	app: App;
	t: (key: TranslationKey) => string;
	treeData: GuidebookTreeData | null;
}

const guidebookMarkdownParser = new GuidebookMarkdownParser();

export async function handleGuidebookBlankCreateCollection(context: GuidebookActionContext): Promise<boolean> {
	const { app, t, treeData } = context;
	const guidebookRootPath = treeData?.guidebookRootPath;
	if (!guidebookRootPath) {
		new Notice(t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	const collectionName = await promptCollectionName(app, t, {
		title: t("feature.right_sidebar.guidebook.dialog.create_collection.title"),
		placeholder: t("feature.right_sidebar.guidebook.dialog.collection_name.placeholder"),
		initialValue: "",
		validate: (normalizedName) => {
			const targetPath = buildCollectionPath(guidebookRootPath, normalizedName);
			return !app.vault.getAbstractFileByPath(targetPath);
		},
	});
	if (!collectionName) {
		return false;
	}

	try {
		await app.vault.create(buildCollectionPath(guidebookRootPath, collectionName), "");
		return true;
	} catch (error) {
		console.error(error);
		new Notice(t("feature.right_sidebar.guidebook.notice.action_failed"));
		return false;
	}
}

export async function handleGuidebookFileContextAction(
	context: GuidebookActionContext,
	action: GuidebookFileContextAction,
	fileNode: GuidebookTreeFileNode,
): Promise<boolean> {
	const { app, t } = context;
	const file = resolveSingleSourceCollectionFile(app, t, fileNode);
	if (!file) {
		return false;
	}

	try {
		switch (action) {
			case "create_collection":
				return handleGuidebookBlankCreateCollection(context);
			case "create_category": {
				const categoryName = await promptHeadingName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.create_category.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.category_name.placeholder"),
					initialValue: "",
				});
				if (!categoryName) {
					return false;
				}
				await app.vault.process(file, (content) => appendH1(content, categoryName));
				return true;
			}
			case "rename_collection": {
				const collectionName = await promptCollectionName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.rename_collection.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.collection_name.placeholder"),
					initialValue: file.basename,
					validate: (normalizedName) => {
						const nextPath = buildCollectionPath(getParentPath(file.path), normalizedName);
						return nextPath === file.path || !app.vault.getAbstractFileByPath(nextPath);
					},
				});
				if (!collectionName) {
					return false;
				}
				const nextPath = buildCollectionPath(getParentPath(file.path), collectionName);
				if (nextPath === file.path) {
					return false;
				}
				await app.fileManager.renameFile(file, nextPath);
				return true;
			}
			case "delete_collection": {
				const confirmed = await askForConfirmation(app, {
					title: t("feature.right_sidebar.guidebook.dialog.delete_collection.title"),
					message: formatTemplate(t("feature.right_sidebar.guidebook.dialog.delete_collection.message"), {
						name: file.basename,
					}),
					confirmText: t("settings.common.delete"),
					cancelText: t("settings.common.cancel"),
					confirmIsDanger: true,
				});
				if (!confirmed) {
					return false;
				}
				await app.fileManager.trashFile(file);
				return true;
			}
			default:
				return false;
		}
	} catch (error) {
		console.error(error);
		new Notice(t("feature.right_sidebar.guidebook.notice.action_failed"));
		return false;
	}
}

export async function handleGuidebookH1ContextAction(
	context: GuidebookActionContext,
	action: GuidebookH1ContextAction,
	_fileNode: GuidebookTreeFileNode,
	h1Node: GuidebookTreeH1Node,
): Promise<boolean> {
	const { app, t } = context;
	const file = resolveCollectionFileByPath(app, h1Node.sourcePath);
	if (!file) {
		new Notice(t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	try {
		switch (action) {
			case "create_category": {
				const categoryName = await promptHeadingName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.create_category.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.category_name.placeholder"),
					initialValue: "",
				});
				if (!categoryName) {
					return false;
				}
				await app.vault.process(file, (content) => appendH1(content, categoryName));
				return true;
			}
			case "create_setting": {
				const settingName = await promptHeadingName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.create_setting.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.setting_name.placeholder"),
					initialValue: "",
				});
				if (!settingName) {
					return false;
				}
				await app.vault.process(file, (content) => appendH2(content, h1Node.h1IndexInSource, settingName));
				return true;
			}
			case "rename_category": {
				const renamed = await promptHeadingName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.rename_category.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.category_name.placeholder"),
					initialValue: h1Node.title,
				});
				if (!renamed || renamed === h1Node.title) {
					return false;
				}
				await app.vault.process(file, (content) => renameH1(content, h1Node.h1IndexInSource, renamed));
				return true;
			}
			case "delete_category": {
				const confirmed = await askForConfirmation(app, {
					title: t("feature.right_sidebar.guidebook.dialog.delete_category.title"),
					message: formatTemplate(t("feature.right_sidebar.guidebook.dialog.delete_category.message"), {
						name: h1Node.title,
					}),
					confirmText: t("settings.common.delete"),
					cancelText: t("settings.common.cancel"),
					confirmIsDanger: true,
				});
				if (!confirmed) {
					return false;
				}
				await app.vault.process(file, (content) => deleteH1(content, h1Node.h1IndexInSource));
				return true;
			}
			default:
				return false;
		}
	} catch (error) {
		console.error(error);
		new Notice(t("feature.right_sidebar.guidebook.notice.action_failed"));
		return false;
	}
}

export async function handleGuidebookH2ContextAction(
	context: GuidebookActionContext,
	action: GuidebookH2ContextAction,
	_fileNode: GuidebookTreeFileNode,
	h1Node: GuidebookTreeH1Node,
	h2Node: GuidebookTreeH2Node,
): Promise<boolean> {
	const { app, t } = context;
	const file = resolveCollectionFileByPath(app, h2Node.sourcePath);
	if (!file) {
		new Notice(t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	try {
		switch (action) {
			case "create_setting": {
				const settingName = await promptHeadingName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.create_setting.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.setting_name.placeholder"),
					initialValue: "",
				});
				if (!settingName) {
					return false;
				}
				await app.vault.process(file, (content) => appendH2(content, h1Node.h1IndexInSource, settingName));
				return true;
			}
			case "edit_setting":
				await app.workspace.openLinkText(`${file.path}#${h2Node.title}`, file.path, false);
				return false;
			case "rename_setting": {
				const renamed = await promptHeadingName(app, t, {
					title: t("feature.right_sidebar.guidebook.dialog.rename_setting.title"),
					placeholder: t("feature.right_sidebar.guidebook.dialog.setting_name.placeholder"),
					initialValue: h2Node.title,
				});
				if (!renamed || renamed === h2Node.title) {
					return false;
				}
				await app.vault.process(file, (content) =>
					renameH2(content, h2Node.h1IndexInSource, h2Node.h2IndexInH1, renamed),
				);
				return true;
			}
			case "delete_setting": {
				const confirmed = await askForConfirmation(app, {
					title: t("feature.right_sidebar.guidebook.dialog.delete_setting.title"),
					message: formatTemplate(t("feature.right_sidebar.guidebook.dialog.delete_setting.message"), {
						name: h2Node.title,
					}),
					confirmText: t("settings.common.delete"),
					cancelText: t("settings.common.cancel"),
					confirmIsDanger: true,
				});
				if (!confirmed) {
					return false;
				}
				await app.vault.process(file, (content) =>
					deleteH2(content, h2Node.h1IndexInSource, h2Node.h2IndexInH1),
				);
				return true;
			}
			default:
				return false;
		}
	} catch (error) {
		console.error(error);
		new Notice(t("feature.right_sidebar.guidebook.notice.action_failed"));
		return false;
	}
}

function resolveCollectionFileByPath(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

function resolveSingleSourceCollectionFile(app: App, t: (key: TranslationKey) => string, fileNode: GuidebookTreeFileNode): TFile | null {
	if (fileNode.sourcePaths.length !== 1) {
		new Notice(t("feature.right_sidebar.guidebook.notice.collection_multi_source_unsupported"));
		return null;
	}
	return resolveCollectionFileByPath(app, fileNode.sourcePaths[0] ?? "");
}

function getParentPath(path: string): string {
	const slashIndex = path.lastIndexOf("/");
	return slashIndex >= 0 ? path.slice(0, slashIndex) : "";
}

function normalizeCollectionName(raw: string): string {
	const trimmed = raw.trim();
	return trimmed.replace(/\.md$/i, "");
}

function buildCollectionPath(guidebookRootPath: string, collectionName: string): string {
	return `${guidebookRootPath}/${collectionName}.md`;
}

async function promptCollectionName(
	app: App,
	t: (key: TranslationKey) => string,
	options: {
		title: string;
		placeholder: string;
		initialValue: string;
		validate: (normalizedName: string) => boolean;
	},
): Promise<string | null> {
	return promptTextInput(app, {
		title: options.title,
		placeholder: options.placeholder,
		initialValue: options.initialValue,
		confirmText: t("settings.common.confirm"),
		cancelText: t("settings.common.cancel"),
		normalize: (value) => normalizeCollectionName(value),
		validate: (value) => {
			if (!value) {
				return t("feature.right_sidebar.guidebook.validation.empty");
			}
			if (/[\\/]/.test(value)) {
				return t("feature.right_sidebar.guidebook.validation.invalid_name");
			}
			const available = options.validate(value);
			if (!available) {
				return t("feature.right_sidebar.guidebook.validation.exists");
			}
			return null;
		},
	});
}

async function promptHeadingName(
	app: App,
	t: (key: TranslationKey) => string,
	options: {
		title: string;
		placeholder: string;
		initialValue: string;
	},
): Promise<string | null> {
	return promptTextInput(app, {
		title: options.title,
		placeholder: options.placeholder,
		initialValue: options.initialValue,
		confirmText: t("settings.common.confirm"),
		cancelText: t("settings.common.cancel"),
		normalize: (value) => value.trim(),
		validate: (value) => {
			if (!value) {
				return t("feature.right_sidebar.guidebook.validation.empty");
			}
			if (/[\r\n]/.test(value)) {
				return t("feature.right_sidebar.guidebook.validation.invalid_name");
			}
			return null;
		},
	});
}

function appendH1(content: string, headingTitle: string): string {
	const lines = splitLines(content);
	lines.push(`# ${headingTitle}`);
	return joinLines(lines);
}

function appendH2(content: string, h1Index: number, headingTitle: string): string {
	const lines = splitLines(content);
	const parsed = guidebookMarkdownParser.parseSections(content);
	const targetH1 = parsed.h1Sections[h1Index];
	if (!targetH1) {
		throw new Error("H1 section not found");
	}

	const insertAt = targetH1.endLine;
	const insertLines: string[] = [`## ${headingTitle}`];
	lines.splice(insertAt, 0, ...insertLines);
	return joinLines(lines);
}

function renameH1(content: string, h1Index: number, nextTitle: string): string {
	const lines = splitLines(content);
	const parsed = guidebookMarkdownParser.parseSections(content);
	const targetH1 = parsed.h1Sections[h1Index];
	if (!targetH1) {
		throw new Error("H1 section not found");
	}
	lines[targetH1.startLine] = `# ${nextTitle}`;
	return joinLines(lines);
}

function renameH2(content: string, h1Index: number, h2Index: number, nextTitle: string): string {
	const lines = splitLines(content);
	const parsed = guidebookMarkdownParser.parseSections(content);
	const targetH1 = parsed.h1Sections[h1Index];
	const targetH2 = targetH1?.h2Sections[h2Index];
	if (!targetH2) {
		throw new Error("H2 section not found");
	}
	lines[targetH2.startLine] = `## ${nextTitle}`;
	return joinLines(lines);
}

function deleteH1(content: string, h1Index: number): string {
	const lines = splitLines(content);
	const parsed = guidebookMarkdownParser.parseSections(content);
	const targetH1 = parsed.h1Sections[h1Index];
	if (!targetH1) {
		throw new Error("H1 section not found");
	}
	removeLineRange(lines, targetH1.startLine, targetH1.endLine);
	return joinLines(lines);
}

function deleteH2(content: string, h1Index: number, h2Index: number): string {
	const lines = splitLines(content);
	const parsed = guidebookMarkdownParser.parseSections(content);
	const targetH1 = parsed.h1Sections[h1Index];
	const targetH2 = targetH1?.h2Sections[h2Index];
	if (!targetH2) {
		throw new Error("H2 section not found");
	}
	removeLineRange(lines, targetH2.startLine, targetH2.endLine);
	return joinLines(lines);
}

function removeLineRange(lines: string[], startLine: number, endLine: number): void {
	let removeStart = startLine;
	let removeEnd = endLine;
	while (removeStart > 0 && lines[removeStart - 1]?.trim() === "") {
		removeStart -= 1;
	}
	while (removeEnd < lines.length && lines[removeEnd]?.trim() === "") {
		removeEnd += 1;
	}
	lines.splice(removeStart, removeEnd - removeStart);
}

function splitLines(content: string): string[] {
	if (!content) {
		return [];
	}
	return content.split(/\r?\n/);
}

function joinLines(lines: string[]): string {
	return lines.join("\n");
}

function formatTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_match, token: string) => values[token] ?? "");
}
