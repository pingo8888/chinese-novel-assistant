import { TFile, type Plugin } from "obsidian";
import { DEFAULT_CHAPTER_NAME_FORMAT, type PluginContext } from "../../core";
import { openMarkdownFileWithoutDuplicate } from "../../utils";

const CHAPTER_NUMBER_PATTERN = /第(\d+)章/g;
const PADDED_NUM_PLACEHOLDER_PATTERN = /\{num:(\d+)\}/g;
const NUM_PLACEHOLDER_PATTERN = /\{num\}/g;
const MAX_CHAPTER_FILENAME_CONFLICT_RETRIES = 10000;

export function registerChapterCommands(plugin: Plugin, ctx: PluginContext): void {
	plugin.addCommand({
		id: "create-next-chapter-file",
		name: ctx.t("command.chapter.create.name"),
		checkCallback: (checking) => {
			if (!resolveActiveMarkdownFile(ctx)) {
				return false;
			}
			if (checking) {
				return true;
			}
			void runCreateNextChapterFileCommand(ctx);
			return true;
		},
	});
}

async function runCreateNextChapterFileCommand(ctx: PluginContext): Promise<void> {
	const activeFile = resolveActiveMarkdownFile(ctx);
	if (!activeFile) {
		return;
	}

	const parentPath = resolveParentPath(activeFile.path);
	const siblingMarkdownFiles = resolveSiblingMarkdownFiles(ctx, parentPath);
	const nextChapterNumber = resolveNextChapterNumber(siblingMarkdownFiles);
	const chapterNameFormat = resolveChapterNameFormat(ctx.settings.chapterNameFormat);

	try {
		const resolved = resolveAvailableChapterFilePath(ctx, parentPath, chapterNameFormat, nextChapterNumber);
		const createdFile = await ctx.app.vault.create(resolved.filePath, "");
		await openMarkdownFileWithoutDuplicate(ctx.app, createdFile.path, ctx.settings.openFileInNewTab);
	} catch (error) {
		console.error("[Chinese Novel Assistant] Failed to create next chapter file.", error);
	}
}

function resolveActiveMarkdownFile(ctx: PluginContext): TFile | null {
	const activeFile = ctx.app.workspace.getActiveFile();
	if (!(activeFile instanceof TFile)) {
		return null;
	}
	return activeFile.extension.toLowerCase() === "md" ? activeFile : null;
}

function resolveSiblingMarkdownFiles(ctx: PluginContext, parentPath: string): TFile[] {
	return ctx.app.vault.getMarkdownFiles().filter((file) => resolveParentPath(file.path) === parentPath);
}

function resolveNextChapterNumber(files: readonly TFile[]): number {
	let maxChapterNumber = 0;

	for (const file of files) {
		CHAPTER_NUMBER_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null = null;
		while ((match = CHAPTER_NUMBER_PATTERN.exec(file.basename)) !== null) {
			const rawChapterNumber = match[1] ?? "";
			const parsedChapterNumber = Number.parseInt(rawChapterNumber, 10);
			if (!Number.isFinite(parsedChapterNumber) || parsedChapterNumber <= maxChapterNumber) {
				continue;
			}
			maxChapterNumber = parsedChapterNumber;
		}
	}

	return maxChapterNumber + 1;
}

function resolveAvailableChapterFilePath(
	ctx: PluginContext,
	parentPath: string,
	chapterNameFormat: string,
	initialChapterNumber: number,
): { filePath: string; chapterNumber: number } {
	let chapterNumber = Math.max(1, initialChapterNumber);
	for (let attempt = 0; attempt < MAX_CHAPTER_FILENAME_CONFLICT_RETRIES; attempt += 1) {
		const chapterBasename = buildChapterFileBasename(chapterNumber, chapterNameFormat);
		const targetPath = buildMarkdownFilePath(parentPath, chapterBasename);
		if (!ctx.app.vault.getAbstractFileByPath(targetPath)) {
			return {
				filePath: targetPath,
				chapterNumber,
			};
		}
		chapterNumber += 1;
	}

	throw new Error("Unable to allocate a unique chapter filename.");
}

function buildChapterFileBasename(chapterNumber: number, chapterNameFormat: string): string {
	return applyChapterNameFormat(chapterNameFormat, chapterNumber);
}

function applyChapterNameFormat(template: string, chapterNumber: number): string {
	const plainNumber = String(chapterNumber);
	return template
		.replace(PADDED_NUM_PLACEHOLDER_PATTERN, (_match: string, rawWidth: string) =>
			plainNumber.padStart(resolvePaddingWidth(rawWidth), "0"),
		)
		.replace(NUM_PLACEHOLDER_PATTERN, plainNumber);
}

function resolvePaddingWidth(rawWidth: string): number {
	const parsedWidth = Number.parseInt(rawWidth, 10);
	if (!Number.isFinite(parsedWidth)) {
		return 1;
	}
	return Math.min(32, Math.max(1, parsedWidth));
}

function resolveChapterNameFormat(rawValue: string): string {
	return rawValue.length > 0 ? rawValue : DEFAULT_CHAPTER_NAME_FORMAT;
}

function buildMarkdownFilePath(parentPath: string, basename: string): string {
	return parentPath.length > 0 ? `${parentPath}/${basename}.md` : `${basename}.md`;
}

function resolveParentPath(path: string): string {
	const slashIndex = path.lastIndexOf("/");
	return slashIndex >= 0 ? path.slice(0, slashIndex) : "";
}
