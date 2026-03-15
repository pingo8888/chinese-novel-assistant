import { type App, Notice, TFile } from "obsidian";
import type { TranslationKey } from "../../lang";
import type {
	GuidebookTreeData,
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
	GuidebookTreeH2Node,
} from "./tree-builder";
import { GuidebookMarkdownParser } from "./markdown-parser";
import { askForConfirmation, promptTextInput } from "../../ui";
import { splitLines } from "../../utils";

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
	openFileInNewTab?: boolean;
}

const guidebookMarkdownParser = new GuidebookMarkdownParser();
const DUPLICATE_SETTING_ERROR = "cna_guidebook_setting_exists";
const DUPLICATE_CATEGORY_ERROR = "cna_guidebook_category_exists";
const guidebookFileTitlesCacheByPath = new Map<string, GuidebookFileTitlesCacheEntry>();
const guidebookScopeTitlesCacheByKey = new Map<string, GuidebookScopeTitlesCacheEntry>();

interface GuidebookFileTitlesCacheEntry {
	mtime: number;
	size: number;
	h1Titles: readonly string[];
	h2Titles: readonly string[];
}

interface GuidebookScopeTitlesCacheEntry {
	signature: string;
	h1Titles: readonly string[];
	h2Titles: readonly string[];
}

export async function handleGuidebookBlankCreateCollection(context: GuidebookActionContext): Promise<boolean> {
	const { app, t, treeData } = context;
	const guidebookRootPath = treeData?.guidebookRootPath;
	if (!guidebookRootPath) {
		new Notice(t("feature.guidebook.notice.node_not_found"));
		return false;
	}

	const collectionName = await promptCollectionName(app, t, {
		title: t("feature.guidebook.dialog.create_collection.title"),
		placeholder: t("feature.guidebook.dialog.collection_name.placeholder"),
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
		new Notice(t("feature.guidebook.notice.action_failed"));
		return false;
	}
}

export async function handleGuidebookFileContextAction(
	context: GuidebookActionContext,
	action: GuidebookFileContextAction,
	fileNode: GuidebookTreeFileNode,
): Promise<boolean> {
	const { app, t, treeData } = context;
	const file = resolveSingleSourceCollectionFile(app, t, fileNode);
	if (!file) {
		return false;
	}

	try {
		switch (action) {
			case "create_collection":
				return handleGuidebookBlankCreateCollection(context);
			case "create_category": {
				const categoryName = await promptCategoryName(app, t, file, treeData, {
					title: t("feature.guidebook.dialog.create_category.title"),
					placeholder: t("feature.guidebook.dialog.category_name.placeholder"),
					initialValue: "",
				});
				if (!categoryName) {
					return false;
				}
				await appendH1WithUniquenessCheck(app, file, treeData, categoryName);
				return true;
			}
			case "rename_collection": {
				const collectionName = await promptCollectionName(app, t, {
					title: t("feature.guidebook.dialog.rename_collection.title"),
					placeholder: t("feature.guidebook.dialog.collection_name.placeholder"),
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
					title: t("feature.guidebook.dialog.delete_collection.title"),
					message: formatTemplate(t("feature.guidebook.dialog.delete_collection.message"), {
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
		if (isDuplicateGuidebookTitleError(error)) {
			new Notice(t("feature.guidebook.validation.exists"));
			return false;
		}
		console.error(error);
		new Notice(t("feature.guidebook.notice.action_failed"));
		return false;
	}
}

export async function handleGuidebookH1ContextAction(
	context: GuidebookActionContext,
	action: GuidebookH1ContextAction,
	_fileNode: GuidebookTreeFileNode,
	h1Node: GuidebookTreeH1Node,
): Promise<boolean> {
	const { app, t, treeData } = context;
	const file = resolveCollectionFileByPath(app, h1Node.sourcePath);
	if (!file) {
		new Notice(t("feature.guidebook.notice.node_not_found"));
		return false;
	}

	try {
		switch (action) {
			case "create_category": {
				const categoryName = await promptCategoryName(app, t, file, treeData, {
					title: t("feature.guidebook.dialog.create_category.title"),
					placeholder: t("feature.guidebook.dialog.category_name.placeholder"),
					initialValue: "",
				});
				if (!categoryName) {
					return false;
				}
				await appendH1WithUniquenessCheck(app, file, treeData, categoryName);
				return true;
			}
			case "create_setting": {
				const settingName = await promptSettingName(app, t, file, treeData, {
					title: t("feature.guidebook.dialog.create_setting.title"),
					placeholder: t("feature.guidebook.dialog.setting_name.placeholder"),
					initialValue: "",
				});
				if (!settingName) {
					return false;
				}
				await appendH2WithUniquenessCheck(app, file, treeData, h1Node.h1IndexInSource, settingName);
				return true;
			}
			case "rename_category": {
				const renamed = await promptCategoryName(app, t, file, treeData, {
					title: t("feature.guidebook.dialog.rename_category.title"),
					placeholder: t("feature.guidebook.dialog.category_name.placeholder"),
					initialValue: h1Node.title,
					ignoreTitle: h1Node.title,
				});
				if (!renamed || renamed === h1Node.title) {
					return false;
				}
				await renameH1WithUniquenessCheck(app, file, treeData, h1Node.h1IndexInSource, renamed);
				return true;
			}
			case "delete_category": {
				const confirmed = await askForConfirmation(app, {
					title: t("feature.guidebook.dialog.delete_category.title"),
					message: formatTemplate(t("feature.guidebook.dialog.delete_category.message"), {
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
		if (isDuplicateGuidebookTitleError(error)) {
			new Notice(t("feature.guidebook.validation.exists"));
			return false;
		}
		console.error(error);
		new Notice(t("feature.guidebook.notice.action_failed"));
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
	const { app, t, treeData } = context;
	const file = resolveCollectionFileByPath(app, h2Node.sourcePath);
	if (!file) {
		new Notice(t("feature.guidebook.notice.node_not_found"));
		return false;
	}

	try {
		switch (action) {
			case "create_setting": {
				const settingName = await promptSettingName(app, t, file, treeData, {
					title: t("feature.guidebook.dialog.create_setting.title"),
					placeholder: t("feature.guidebook.dialog.setting_name.placeholder"),
					initialValue: "",
				});
				if (!settingName) {
					return false;
				}
				await appendH2WithUniquenessCheck(app, file, treeData, h1Node.h1IndexInSource, settingName);
				return true;
			}
			case "edit_setting":
				await app.workspace.openLinkText(
					`${file.path}#${h2Node.title}`,
					file.path,
					context.openFileInNewTab ?? false,
				);
				return false;
			case "rename_setting": {
				const renamed = await promptSettingName(app, t, file, treeData, {
					title: t("feature.guidebook.dialog.rename_setting.title"),
					placeholder: t("feature.guidebook.dialog.setting_name.placeholder"),
					initialValue: h2Node.title,
					ignoreTitle: h2Node.title,
				});
				if (!renamed || renamed === h2Node.title) {
					return false;
				}
				await renameH2WithUniquenessCheck(app, file, treeData, h2Node.h1IndexInSource, h2Node.h2IndexInH1, renamed);
				return true;
			}
			case "delete_setting": {
				const confirmed = await askForConfirmation(app, {
					title: t("feature.guidebook.dialog.delete_setting.title"),
					message: formatTemplate(t("feature.guidebook.dialog.delete_setting.message"), {
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
		if (isDuplicateGuidebookTitleError(error)) {
			new Notice(t("feature.guidebook.validation.exists"));
			return false;
		}
		console.error(error);
		new Notice(t("feature.guidebook.notice.action_failed"));
		return false;
	}
}

export async function appendGuidebookSettingToCategoryByPath(
	context: GuidebookActionContext,
	sourcePath: string,
	h1IndexInSource: number,
	settingName: string,
	h1Title?: string,
): Promise<boolean> {
	const { app, t, treeData } = context;
	const file = resolveCollectionFileByPath(app, sourcePath);
	if (!file) {
		new Notice(t("feature.guidebook.notice.node_not_found"));
		return false;
	}
	const normalizedSettingName = settingName.trim();
	if (normalizedSettingName.length === 0) {
		new Notice(t("feature.guidebook.validation.empty"));
		return false;
	}

	try {
		let targetH1Index = h1IndexInSource;
		const normalizedH1Title = h1Title?.trim();
		if (normalizedH1Title && normalizedH1Title.length > 0) {
			const resolvedH1Index = await resolveH1IndexByTitle(app, file, normalizedH1Title);
			if (resolvedH1Index >= 0) {
				targetH1Index = resolvedH1Index;
			}
		}
		await appendH2WithUniquenessCheck(app, file, treeData, targetH1Index, normalizedSettingName);
		return true;
	} catch (error) {
		if (isDuplicateGuidebookTitleError(error)) {
			new Notice(t("feature.guidebook.validation.exists"));
			return false;
		}
		console.error(error);
		new Notice(t("feature.guidebook.notice.action_failed"));
		return false;
	}
}

async function resolveH1IndexByTitle(app: App, file: TFile, h1Title: string): Promise<number> {
	const markdown = await app.vault.cachedRead(file);
	const h1List = guidebookMarkdownParser.parseTree(markdown);
	for (let index = 0; index < h1List.length; index += 1) {
		const currentTitle = h1List[index]?.title?.trim() ?? "";
		if (currentTitle === h1Title) {
			return index;
		}
	}
	return -1;
}

function resolveCollectionFileByPath(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

function resolveSingleSourceCollectionFile(app: App, t: (key: TranslationKey) => string, fileNode: GuidebookTreeFileNode): TFile | null {
	if (fileNode.sourcePaths.length !== 1) {
		new Notice(t("feature.guidebook.notice.collection_multi_source_unsupported"));
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
				return t("feature.guidebook.validation.empty");
			}
			if (/[\\/]/.test(value)) {
				return t("feature.guidebook.validation.invalid_name");
			}
			const available = options.validate(value);
			if (!available) {
				return t("feature.guidebook.validation.exists");
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
		validate?: (value: string) => string | null;
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
				return t("feature.guidebook.validation.empty");
			}
			if (/[\r\n]/.test(value)) {
				return t("feature.guidebook.validation.invalid_name");
			}
			const customValidationMessage = options.validate?.(value);
			if (customValidationMessage) {
				return customValidationMessage;
			}
			return null;
		},
	});
}

async function promptSettingName(
	app: App,
	t: (key: TranslationKey) => string,
	file: TFile,
	treeData: GuidebookTreeData | null,
	options: {
		title: string;
		placeholder: string;
		initialValue: string;
		ignoreTitle?: string;
	},
): Promise<string | null> {
	const existingTitles = await collectAllCollectionH2Titles(app, file, treeData, options.ignoreTitle);
	return promptHeadingName(app, t, {
		...options,
		validate: (value) =>
			existingTitles.has(value) ? t("feature.guidebook.validation.exists") : null,
	});
}

async function promptCategoryName(
	app: App,
	t: (key: TranslationKey) => string,
	file: TFile,
	treeData: GuidebookTreeData | null,
	options: {
		title: string;
		placeholder: string;
		initialValue: string;
		ignoreTitle?: string;
	},
): Promise<string | null> {
	const existingTitles = await collectAllCollectionH1Titles(app, file, treeData, options.ignoreTitle);
	return promptHeadingName(app, t, {
		...options,
		validate: (value) =>
			existingTitles.has(value) ? t("feature.guidebook.validation.exists") : null,
	});
}

async function appendH1WithUniquenessCheck(
	app: App,
	file: TFile,
	treeData: GuidebookTreeData | null,
	categoryName: string,
): Promise<void> {
	const existingTitles = await collectAllCollectionH1Titles(app, file, treeData);
	if (existingTitles.has(categoryName)) {
		throw new Error(DUPLICATE_CATEGORY_ERROR);
	}
	await app.vault.process(file, (content) => {
		if (collectH1Titles(content).has(categoryName)) {
			throw new Error(DUPLICATE_CATEGORY_ERROR);
		}
		return appendH1(content, categoryName);
	});
}

async function appendH2WithUniquenessCheck(
	app: App,
	file: TFile,
	treeData: GuidebookTreeData | null,
	h1Index: number,
	settingName: string,
): Promise<void> {
	const existingTitles = await collectAllCollectionH2Titles(app, file, treeData);
	if (existingTitles.has(settingName)) {
		throw new Error(DUPLICATE_SETTING_ERROR);
	}
	await app.vault.process(file, (content) => {
		if (collectH2Titles(content).has(settingName)) {
			throw new Error(DUPLICATE_SETTING_ERROR);
		}
		return appendH2(content, h1Index, settingName);
	});
}

async function renameH1WithUniquenessCheck(
	app: App,
	file: TFile,
	treeData: GuidebookTreeData | null,
	h1Index: number,
	nextTitle: string,
): Promise<void> {
	const existingTitles = await collectAllCollectionH1Titles(app, file, treeData);
	if (existingTitles.has(nextTitle)) {
		throw new Error(DUPLICATE_CATEGORY_ERROR);
	}
	await app.vault.process(file, (content) => {
		const parsed = guidebookMarkdownParser.parseTree(content);
		const currentTitle = parsed[h1Index]?.title?.trim() ?? "";
		const titleSet = collectH1Titles(content);
		if (currentTitle.length > 0) {
			titleSet.delete(currentTitle);
		}
		if (titleSet.has(nextTitle.trim())) {
			throw new Error(DUPLICATE_CATEGORY_ERROR);
		}
		return renameH1(content, h1Index, nextTitle);
	});
}

async function renameH2WithUniquenessCheck(
	app: App,
	file: TFile,
	treeData: GuidebookTreeData | null,
	h1Index: number,
	h2Index: number,
	nextTitle: string,
): Promise<void> {
	const existingTitles = await collectAllCollectionH2Titles(app, file, treeData);
	if (existingTitles.has(nextTitle)) {
		throw new Error(DUPLICATE_SETTING_ERROR);
	}
	await app.vault.process(file, (content) => {
		const parsed = guidebookMarkdownParser.parseTree(content);
		const currentTitle = parsed[h1Index]?.h2List[h2Index]?.title?.trim() ?? "";
		const titleSet = collectH2Titles(content);
		if (currentTitle.length > 0) {
			titleSet.delete(currentTitle);
		}
		if (titleSet.has(nextTitle.trim())) {
			throw new Error(DUPLICATE_SETTING_ERROR);
		}
		return renameH2(content, h1Index, h2Index, nextTitle);
	});
}

function isDuplicateGuidebookTitleError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message === DUPLICATE_SETTING_ERROR || error.message === DUPLICATE_CATEGORY_ERROR;
}

function appendH1(content: string, headingTitle: string): string {
	const lines = splitLines(content);
	lines.push(`# ${headingTitle}`);
	return joinLines(lines);
}

function collectH2Titles(content: string): Set<string> {
	const titles = new Set<string>();
	const h1List = guidebookMarkdownParser.parseTree(content);
	for (const h1Node of h1List) {
		for (const h2Node of h1Node.h2List) {
			const title = h2Node.title.trim();
			if (title.length > 0) {
				titles.add(title);
			}
		}
	}
	return titles;
}

function collectH1Titles(content: string): Set<string> {
	const titles = new Set<string>();
	const h1List = guidebookMarkdownParser.parseTree(content);
	for (const h1Node of h1List) {
		const title = h1Node.title.trim();
		if (title.length > 0) {
			titles.add(title);
		}
	}
	return titles;
}

async function collectAllCollectionH2Titles(
	app: App,
	currentFile: TFile,
	treeData: GuidebookTreeData | null,
	excludeTitle?: string,
): Promise<Set<string>> {
	const { h2Titles } = await resolveCollectionScopeTitles(app, currentFile, treeData);
	const titles = new Set(h2Titles);
	const normalizedExcludeTitle = excludeTitle?.trim();
	if (normalizedExcludeTitle && normalizedExcludeTitle.length > 0) {
		titles.delete(normalizedExcludeTitle);
	}
	return titles;
}

async function collectAllCollectionH1Titles(
	app: App,
	currentFile: TFile,
	treeData: GuidebookTreeData | null,
	excludeTitle?: string,
): Promise<Set<string>> {
	const { h1Titles } = await resolveCollectionScopeTitles(app, currentFile, treeData);
	const titles = new Set(h1Titles);
	const normalizedExcludeTitle = excludeTitle?.trim();
	if (normalizedExcludeTitle && normalizedExcludeTitle.length > 0) {
		titles.delete(normalizedExcludeTitle);
	}
	return titles;
}

function resolveCollectionFilesForUniquenessCheck(
	app: App,
	currentFile: TFile,
	treeData: GuidebookTreeData | null,
): TFile[] {
	const guidebookRootPath = treeData?.guidebookRootPath;
	if (!guidebookRootPath) {
		const parentPath = getParentPath(currentFile.path);
		return app.vault
			.getMarkdownFiles()
			.filter((file) => getParentPath(file.path) === parentPath);
	}

	return app.vault
		.getMarkdownFiles()
		.filter((file) => file.path === guidebookRootPath || file.path.startsWith(`${guidebookRootPath}/`));
}

async function resolveCollectionScopeTitles(
	app: App,
	currentFile: TFile,
	treeData: GuidebookTreeData | null,
): Promise<{ h1Titles: readonly string[]; h2Titles: readonly string[] }> {
	const files = resolveCollectionFilesForUniquenessCheck(app, currentFile, treeData);
	const scopeKey = resolveCollectionScopeCacheKey(currentFile, treeData);
	const signature = buildCollectionScopeSignature(files);
	const cachedScope = guidebookScopeTitlesCacheByKey.get(scopeKey);
	if (cachedScope && cachedScope.signature === signature) {
		return {
			h1Titles: cachedScope.h1Titles,
			h2Titles: cachedScope.h2Titles,
		};
	}

	const h1TitleSet = new Set<string>();
	const h2TitleSet = new Set<string>();
	for (const file of files) {
		const fileTitles = await resolveFileTitles(app, file);
		for (const title of fileTitles.h1Titles) {
			h1TitleSet.add(title);
		}
		for (const title of fileTitles.h2Titles) {
			h2TitleSet.add(title);
		}
	}

	const entry: GuidebookScopeTitlesCacheEntry = {
		signature,
		h1Titles: Array.from(h1TitleSet),
		h2Titles: Array.from(h2TitleSet),
	};
	guidebookScopeTitlesCacheByKey.set(scopeKey, entry);
	return {
		h1Titles: entry.h1Titles,
		h2Titles: entry.h2Titles,
	};
}

async function resolveFileTitles(
	app: App,
	file: TFile,
): Promise<{ h1Titles: readonly string[]; h2Titles: readonly string[] }> {
	const cached = guidebookFileTitlesCacheByPath.get(file.path);
	if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
		return {
			h1Titles: cached.h1Titles,
			h2Titles: cached.h2Titles,
		};
	}

	const content = await app.vault.cachedRead(file);
	const parsed = guidebookMarkdownParser.parseTree(content);
	const h1TitleSet = new Set<string>();
	const h2TitleSet = new Set<string>();
	for (const h1Node of parsed) {
		const h1Title = h1Node.title.trim();
		if (h1Title.length > 0) {
			h1TitleSet.add(h1Title);
		}
		for (const h2Node of h1Node.h2List) {
			const h2Title = h2Node.title.trim();
			if (h2Title.length > 0) {
				h2TitleSet.add(h2Title);
			}
		}
	}

	const entry: GuidebookFileTitlesCacheEntry = {
		mtime: file.stat.mtime,
		size: file.stat.size,
		h1Titles: Array.from(h1TitleSet),
		h2Titles: Array.from(h2TitleSet),
	};
	guidebookFileTitlesCacheByPath.set(file.path, entry);
	return {
		h1Titles: entry.h1Titles,
		h2Titles: entry.h2Titles,
	};
}

function resolveCollectionScopeCacheKey(currentFile: TFile, treeData: GuidebookTreeData | null): string {
	const guidebookRootPath = treeData?.guidebookRootPath;
	if (guidebookRootPath) {
		return `guidebook:${guidebookRootPath}`;
	}
	return `parent:${getParentPath(currentFile.path)}`;
}

function buildCollectionScopeSignature(files: TFile[]): string {
	const orderedFiles = [...files].sort((left, right) => left.path.localeCompare(right.path));
	return orderedFiles
		.map((file) => `${file.path}\u0000${file.stat.mtime}\u0000${file.stat.size}`)
		.join("\u0001");
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

function joinLines(lines: string[]): string {
	return lines.join("\n");
}

function formatTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_match, token: string) => values[token] ?? "");
}


