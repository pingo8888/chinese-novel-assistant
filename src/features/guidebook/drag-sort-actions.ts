import { type App, Notice, TFile } from "obsidian";
import type { TranslationKey } from "../../lang";
import type { ChineseNovelAssistantSettings } from "../../settings/settings";
import { GuidebookMarkdownParser } from "./markdown-parser";
import type {
	GuidebookTreeData,
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
	GuidebookTreeH2Node,
} from "./tree-builder";

type DragDropPosition = "before" | "after" | "inside";

export type GuidebookTreeDragMoveRequest =
	| {
			kind: "file";
			sourceFileNode: GuidebookTreeFileNode;
			targetFileNode: GuidebookTreeFileNode;
			position: Exclude<DragDropPosition, "inside">;
	  }
	| {
			kind: "h1";
			sourceFileNode: GuidebookTreeFileNode;
			sourceH1Node: GuidebookTreeH1Node;
			targetFileNode: GuidebookTreeFileNode;
			targetH1Node?: GuidebookTreeH1Node;
			position: DragDropPosition;
	  }
	| {
			kind: "h2";
			sourceFileNode: GuidebookTreeFileNode;
			sourceH1Node: GuidebookTreeH1Node;
			sourceH2Node: GuidebookTreeH2Node;
			targetFileNode: GuidebookTreeFileNode;
			targetH1Node: GuidebookTreeH1Node;
			targetH2Node?: GuidebookTreeH2Node;
			position: DragDropPosition;
	  };

export interface GuidebookTreeDragSortContext {
	app: App;
	t: (key: TranslationKey) => string;
	treeData: GuidebookTreeData | null;
	getSettings: () => ChineseNovelAssistantSettings;
	setSettings: (patch: Partial<ChineseNovelAssistantSettings>) => Promise<void>;
}

const markdownParser = new GuidebookMarkdownParser();

export async function handleGuidebookTreeDragMove(
	context: GuidebookTreeDragSortContext,
	request: GuidebookTreeDragMoveRequest,
): Promise<boolean> {
	switch (request.kind) {
		case "file":
			return handleCollectionMove(context, request);
		case "h1":
			return handleH1Move(context, request);
		case "h2":
			return handleH2Move(context, request);
		default:
			return false;
	}
}

async function handleCollectionMove(
	context: GuidebookTreeDragSortContext,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "file" }>,
): Promise<boolean> {
	const guidebookRootPath = context.treeData?.guidebookRootPath;
	if (!guidebookRootPath) {
		new Notice(context.t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	const sourcePath = resolveSingleSourceCollectionPath(context, request.sourceFileNode);
	const targetPath = resolveSingleSourceCollectionPath(context, request.targetFileNode);
	if (!sourcePath || !targetPath || sourcePath === targetPath) {
		return false;
	}

	const baseOrder = collectOrderedCollectionPaths(context.treeData);
	const nextOrder = movePathInArray(baseOrder, sourcePath, targetPath, request.position);
	if (nextOrder.length === 0 || areStringArraysEqual(baseOrder, nextOrder)) {
		return false;
	}

	const settings = context.getSettings();
	await context.setSettings({
		guidebookCollectionOrders: {
			...settings.guidebookCollectionOrders,
			[guidebookRootPath]: nextOrder,
		},
	});
	return true;
}

async function handleH1Move(
	context: GuidebookTreeDragSortContext,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h1" }>,
): Promise<boolean> {
	const sourceFile = resolveCollectionFileByPath(context.app, request.sourceH1Node.sourcePath);
	if (!sourceFile) {
		new Notice(context.t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	const targetPath = request.targetH1Node?.sourcePath ?? resolveSingleSourcePath(request.targetFileNode);
	if (!targetPath) {
		new Notice(context.t("feature.right_sidebar.guidebook.notice.collection_multi_source_unsupported"));
		return false;
	}

	const targetFile = resolveCollectionFileByPath(context.app, targetPath);
	if (!targetFile) {
		new Notice(context.t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	try {
		if (sourceFile.path === targetFile.path) {
			let changed = false;
			await context.app.vault.process(sourceFile, (content) => {
				const next = moveH1WithinContent(content, request);
				changed = next !== content;
				return next;
			});
			return changed;
		}

		const sourceContent = await context.app.vault.cachedRead(sourceFile);
		const targetContent = await context.app.vault.cachedRead(targetFile);
		const moved = moveH1AcrossContents(sourceContent, targetContent, request);
		if (!moved) {
			return false;
		}
		await context.app.vault.process(sourceFile, () => moved.sourceContent);
		await context.app.vault.process(targetFile, () => moved.targetContent);
		return true;
	} catch (error) {
		console.error(error);
		new Notice(context.t("feature.right_sidebar.guidebook.notice.action_failed"));
		return false;
	}
}

async function handleH2Move(
	context: GuidebookTreeDragSortContext,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h2" }>,
): Promise<boolean> {
	const sourceFile = resolveCollectionFileByPath(context.app, request.sourceH2Node.sourcePath);
	const targetFile = resolveCollectionFileByPath(context.app, request.targetH1Node.sourcePath);
	if (!sourceFile || !targetFile) {
		new Notice(context.t("feature.right_sidebar.guidebook.notice.node_not_found"));
		return false;
	}

	try {
		if (sourceFile.path === targetFile.path) {
			let changed = false;
			await context.app.vault.process(sourceFile, (content) => {
				const next = moveH2WithinContent(content, request);
				changed = next !== content;
				return next;
			});
			return changed;
		}

		const sourceContent = await context.app.vault.cachedRead(sourceFile);
		const targetContent = await context.app.vault.cachedRead(targetFile);
		const moved = moveH2AcrossContents(sourceContent, targetContent, request);
		if (!moved) {
			return false;
		}
		await context.app.vault.process(sourceFile, () => moved.sourceContent);
		await context.app.vault.process(targetFile, () => moved.targetContent);
		return true;
	} catch (error) {
		console.error(error);
		new Notice(context.t("feature.right_sidebar.guidebook.notice.action_failed"));
		return false;
	}
}

function moveH1WithinContent(
	content: string,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h1" }>,
): string {
	const lines = splitLines(content);
	const parsed = markdownParser.parseSections(content);
	const sourceSection = parsed.h1Sections[request.sourceH1Node.h1IndexInSource];
	if (!sourceSection) {
		throw new Error("H1 source section not found");
	}
	const insertLine = resolveH1InsertLine(lines.length, parsed, request);
	const movedLines = moveLineRange(lines, sourceSection.startLine, sourceSection.endLine, insertLine);
	return joinLines(movedLines);
}

function moveH2WithinContent(
	content: string,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h2" }>,
): string {
	const lines = splitLines(content);
	const parsed = markdownParser.parseSections(content);
	const sourceH1 = parsed.h1Sections[request.sourceH2Node.h1IndexInSource];
	const sourceH2 = sourceH1?.h2Sections[request.sourceH2Node.h2IndexInH1];
	if (!sourceH2) {
		throw new Error("H2 source section not found");
	}
	const insertLine = resolveH2InsertLine(parsed, request);
	const movedLines = moveLineRange(lines, sourceH2.startLine, sourceH2.endLine, insertLine);
	return joinLines(movedLines);
}

function moveH1AcrossContents(
	sourceContent: string,
	targetContent: string,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h1" }>,
): { sourceContent: string; targetContent: string } | null {
	const sourceLines = splitLines(sourceContent);
	const sourceParsed = markdownParser.parseSections(sourceContent);
	const sourceSection = sourceParsed.h1Sections[request.sourceH1Node.h1IndexInSource];
	if (!sourceSection) {
		throw new Error("H1 source section not found");
	}

	const movedBlock = sourceLines.slice(sourceSection.startLine, sourceSection.endLine);
	if (movedBlock.length === 0) {
		return null;
	}

	const sourceNextLines = removeLineRange(sourceLines, sourceSection.startLine, sourceSection.endLine);
	const targetLines = splitLines(targetContent);
	const targetParsed = markdownParser.parseSections(targetContent);
	const insertLine = resolveH1InsertLine(targetLines.length, targetParsed, request);
	const targetNextLines = insertLineRange(targetLines, insertLine, movedBlock);
	return {
		sourceContent: joinLines(sourceNextLines),
		targetContent: joinLines(targetNextLines),
	};
}

function moveH2AcrossContents(
	sourceContent: string,
	targetContent: string,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h2" }>,
): { sourceContent: string; targetContent: string } | null {
	const sourceLines = splitLines(sourceContent);
	const sourceParsed = markdownParser.parseSections(sourceContent);
	const sourceH1 = sourceParsed.h1Sections[request.sourceH2Node.h1IndexInSource];
	const sourceH2 = sourceH1?.h2Sections[request.sourceH2Node.h2IndexInH1];
	if (!sourceH2) {
		throw new Error("H2 source section not found");
	}

	const movedBlock = sourceLines.slice(sourceH2.startLine, sourceH2.endLine);
	if (movedBlock.length === 0) {
		return null;
	}

	const sourceNextLines = removeLineRange(sourceLines, sourceH2.startLine, sourceH2.endLine);
	const targetLines = splitLines(targetContent);
	const targetParsed = markdownParser.parseSections(targetContent);
	const insertLine = resolveH2InsertLine(targetParsed, request);
	const targetNextLines = insertLineRange(targetLines, insertLine, movedBlock);
	return {
		sourceContent: joinLines(sourceNextLines),
		targetContent: joinLines(targetNextLines),
	};
}

function resolveH1InsertLine(
	contentLineCount: number,
	parsed: ReturnType<GuidebookMarkdownParser["parseSections"]>,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h1" }>,
): number {
	if (request.position === "inside") {
		return contentLineCount;
	}
	const targetNode = request.targetH1Node;
	if (!targetNode) {
		throw new Error("H1 target not found");
	}
	const targetSection = parsed.h1Sections[targetNode.h1IndexInSource];
	if (!targetSection) {
		throw new Error("H1 target section not found");
	}
	return request.position === "before" ? targetSection.startLine : targetSection.endLine;
}

function resolveH2InsertLine(
	parsed: ReturnType<GuidebookMarkdownParser["parseSections"]>,
	request: Extract<GuidebookTreeDragMoveRequest, { kind: "h2" }>,
): number {
	const targetH1 = parsed.h1Sections[request.targetH1Node.h1IndexInSource];
	if (!targetH1) {
		throw new Error("H2 target H1 section not found");
	}
	if (request.position === "inside") {
		return targetH1.endLine;
	}
	const targetNode = request.targetH2Node;
	if (!targetNode) {
		throw new Error("H2 target section not found");
	}
	const targetH2 = targetH1.h2Sections[targetNode.h2IndexInH1];
	if (!targetH2) {
		throw new Error("H2 target section not found");
	}
	return request.position === "before" ? targetH2.startLine : targetH2.endLine;
}

function moveLineRange(lines: string[], startLine: number, endLine: number, insertLine: number): string[] {
	const movedBlock = lines.slice(startLine, endLine);
	if (movedBlock.length === 0) {
		return lines;
	}
	let normalizedInsertLine = clampLineIndex(insertLine, 0, lines.length);
	if (normalizedInsertLine > startLine) {
		normalizedInsertLine -= movedBlock.length;
	}
	if (normalizedInsertLine === startLine) {
		return lines;
	}
	const remaining = removeLineRange(lines, startLine, endLine);
	return insertLineRange(remaining, normalizedInsertLine, movedBlock);
}

function removeLineRange(lines: string[], startLine: number, endLine: number): string[] {
	return [...lines.slice(0, startLine), ...lines.slice(endLine)];
}

function insertLineRange(lines: string[], insertLine: number, insertedLines: string[]): string[] {
	const normalizedInsertLine = clampLineIndex(insertLine, 0, lines.length);
	return [...lines.slice(0, normalizedInsertLine), ...insertedLines, ...lines.slice(normalizedInsertLine)];
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

function clampLineIndex(value: number, min: number, max: number): number {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
}

function resolveCollectionFileByPath(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

function collectOrderedCollectionPaths(treeData: GuidebookTreeData | null): string[] {
	if (!treeData) {
		return [];
	}
	const paths: string[] = [];
	for (const fileNode of treeData.files) {
		const path = resolveSingleSourcePath(fileNode);
		if (path) {
			paths.push(path);
		}
	}
	return paths;
}

function resolveSingleSourceCollectionPath(
	context: GuidebookTreeDragSortContext,
	fileNode: GuidebookTreeFileNode,
): string | null {
	const path = resolveSingleSourcePath(fileNode);
	if (path) {
		return path;
	}
	new Notice(context.t("feature.right_sidebar.guidebook.notice.collection_multi_source_unsupported"));
	return null;
}

function resolveSingleSourcePath(fileNode: GuidebookTreeFileNode): string | null {
	if (fileNode.sourcePaths.length !== 1) {
		return null;
	}
	return fileNode.sourcePaths[0] ?? null;
}

function movePathInArray(
	paths: string[],
	sourcePath: string,
	targetPath: string,
	position: "before" | "after",
): string[] {
	const next = paths.filter((path) => path !== sourcePath);
	const targetIndex = next.indexOf(targetPath);
	if (targetIndex < 0) {
		next.push(sourcePath);
		return next;
	}
	const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
	next.splice(insertIndex, 0, sourcePath);
	return next;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}
