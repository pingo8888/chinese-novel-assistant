import { MarkdownView, TFile, type App } from "obsidian";
import {
	type SettingDatas,
	NovelLibraryService,
	NOVEL_LIBRARY_SUBDIR_NAMES,
} from "../../core";
import {
	asNumber,
	buildRandomToken,
	extractPlainTextFromMarkdown,
	isRecord,
	parseColorHex,
	resolveEditorViewFromMarkdownView,
} from "../../utils";
import type { AnnotationCard, AnnotationEntry } from "./views/types";
import { normalizeAnnotationColorHex } from "./color-types";

const ANNO_FILE_SUFFIX = ".anno.md";
const DEFAULT_ANNOTATION_TITLE = "未命名批注";
const ANNOTATION_DATA_BLOCK_WARNING_TEXT = "数据由批注功能管理，请勿删除或手动修改";
const ANNOTATION_DATA_BLOCK_NAME = "cna-data";

class AnnotationJsonParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AnnotationJsonParseError";
	}
}

export interface AnnotationSelectionAnchor {
	line: number;
	ch: number;
	fromOffset: number;
	toOffset: number;
}

export interface AnnotationAnchorSnapshot {
	anchorOffset: number;
	anchorEndOffset: number;
	line: number;
	ch: number;
	colorHex?: string;
}

export class AnnotationRepository {
	private readonly app: App;
	private readonly novelLibraryService: NovelLibraryService;

	constructor(app: App) {
		this.app = app;
		this.novelLibraryService = new NovelLibraryService(app);
	}

	resolveAnnotationRootPaths(settings: SettingDatas): string[] {
		const roots = settings.novelLibraries
			.map((libraryPath) =>
				this.novelLibraryService.resolveNovelLibrarySubdirPath(
					libraryPath,
					NOVEL_LIBRARY_SUBDIR_NAMES.annotation,
				),
			)
			.map((path) => this.novelLibraryService.normalizeVaultPath(path))
			.filter((path) => path.length > 0);
		return Array.from(new Set(roots));
	}

	resolveScopedAnnotationRootPaths(settings: SettingDatas, preferredFilePath?: string | null): string[] {
		const allRoots = this.resolveAnnotationRootPaths(settings);
		if (allRoots.length === 0) {
			return allRoots;
		}
		const referencePath = typeof preferredFilePath === "string" ? preferredFilePath : "";
		if (!referencePath) {
			return [];
		}
		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
		const matchedLibraryRoot = this.novelLibraryService.resolveContainingLibraryRoot(referencePath, normalizedLibraryRoots);
		if (!matchedLibraryRoot) {
			return [];
		}
		const annotationRootPath = this.novelLibraryService.resolveNovelLibrarySubdirPath(
			matchedLibraryRoot,
			NOVEL_LIBRARY_SUBDIR_NAMES.annotation,
		);
		const normalizedAnnotationRootPath = this.novelLibraryService.normalizeVaultPath(annotationRootPath);
		return normalizedAnnotationRootPath ? [normalizedAnnotationRootPath] : allRoots;
	}

	isManagedSourceFile(settings: SettingDatas, sourcePath: string): boolean {
		const normalizedSourcePath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		if (!normalizedSourcePath) {
			return false;
		}
		const lower = normalizedSourcePath.toLowerCase();
		if (!lower.endsWith(".md") || lower.endsWith(ANNO_FILE_SUFFIX)) {
			return false;
		}
		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
		if (normalizedLibraryRoots.length === 0) {
			return false;
		}
		const libraryRoot = this.novelLibraryService.resolveContainingLibraryRoot(normalizedSourcePath, normalizedLibraryRoots);
		if (!libraryRoot) {
			return false;
		}
		return !this.novelLibraryService.isInFeatureRoot(normalizedSourcePath, {
			locale: settings.locale,
			novelLibraries: settings.novelLibraries,
		});
	}

	resolveAnnotationPathBySourcePath(settings: SettingDatas, sourcePath: string): string | null {
		const normalizedSourcePath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		if (!this.isManagedSourceFile(settings, normalizedSourcePath)) {
			return null;
		}
		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
		const libraryRoot = this.novelLibraryService.resolveContainingLibraryRoot(normalizedSourcePath, normalizedLibraryRoots);
		if (!libraryRoot) {
			return null;
		}
		const annotationRootPath = this.novelLibraryService.resolveNovelLibrarySubdirPath(
			libraryRoot,
			NOVEL_LIBRARY_SUBDIR_NAMES.annotation,
		);
		const normalizedAnnotationRootPath = this.novelLibraryService.normalizeVaultPath(annotationRootPath);
		if (!normalizedAnnotationRootPath) {
			return null;
		}
		const relativeSourcePath = normalizedSourcePath.slice(libraryRoot.length).replace(/^\/+/, "");
		if (!relativeSourcePath) {
			return null;
		}
		const relativeWithoutExtension = relativeSourcePath.replace(/\.md$/i, "");
		if (!relativeWithoutExtension) {
			return null;
		}
		return this.novelLibraryService.normalizeVaultPath(`${normalizedAnnotationRootPath}/${relativeWithoutExtension}${ANNO_FILE_SUFFIX}`);
	}

	async listCards(settings: SettingDatas, rootPaths?: string[]): Promise<AnnotationCard[]> {
		const annotationRoots = this.resolveAnnotationRoots(settings, rootPaths);
		if (annotationRoots.length === 0) {
			return [];
		}
		const markdownFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.toLowerCase().endsWith(ANNO_FILE_SUFFIX))
			.filter((file) => annotationRoots.some((rootPath) => this.novelLibraryService.isSameOrChildPath(file.path, rootPath)));
		const cardsNested = await Promise.all(markdownFiles.map((file) => this.readCardsFromAnnotationFile(file)));
		const cards: AnnotationCard[] = [];
		for (const group of cardsNested) {
			cards.push(...group);
		}
		return cards;
	}

	async getCardsByAnnoPath(path: string): Promise<AnnotationCard[]> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const entry = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(entry instanceof TFile) || !normalizedPath.toLowerCase().endsWith(ANNO_FILE_SUFFIX)) {
			return [];
		}
		return this.readCardsFromAnnotationFile(entry);
	}

	async createEntryAtSelection(
		settings: SettingDatas,
		sourcePath: string,
		selection: AnnotationSelectionAnchor,
		title = DEFAULT_ANNOTATION_TITLE,
		colorHex?: string,
	): Promise<AnnotationCard> {
		const normalizedSourcePath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		const annotationPath = this.resolveAnnotationPathBySourcePath(settings, normalizedSourcePath);
		if (!annotationPath) {
			throw new Error(`Cannot resolve annotation path for source: ${sourcePath}`);
		}
		const selectionStart = Math.max(0, Math.round(Math.min(selection.fromOffset, selection.toOffset)));
		const selectionEnd = Math.max(selectionStart + 1, Math.round(Math.max(selection.fromOffset, selection.toOffset)));
		const nextColorHex = normalizeAnnotationColorHex(colorHex);
		await this.ensureParentFolder(annotationPath);
		const existingEntries = await this.readEntriesByPath(annotationPath);
		const connectedEntries = existingEntries.filter((entry) =>
			entry.sourcePath === normalizedSourcePath && isConnectedRange(entry.anchorOffset, entry.anchorEndOffset, selectionStart, selectionEnd),
		);
		const now = Date.now();

		if (connectedEntries.length > 0) {
			const primaryEntry = [...connectedEntries].sort(compareEntriesByRangeStart)[0];
			if (!primaryEntry) {
				throw new Error("Connected annotation entry expected but not found.");
			}
			const nextStart = Math.min(primaryEntry.anchorOffset, selectionStart);
			const nextEnd = Math.max(primaryEntry.anchorEndOffset, selectionEnd);
			const rangeChanged = primaryEntry.anchorOffset !== nextStart || primaryEntry.anchorEndOffset !== nextEnd;
			primaryEntry.anchorOffset = nextStart;
			primaryEntry.anchorEndOffset = nextEnd;
			const colorChanged = primaryEntry.colorHex !== nextColorHex;
			if (colorChanged) {
				primaryEntry.colorHex = nextColorHex;
			}
			if (nextStart === selectionStart) {
				primaryEntry.line = Math.max(0, Math.round(selection.line));
				primaryEntry.ch = Math.max(0, Math.round(selection.ch));
			}
			const changed = rangeChanged || colorChanged;
			if (changed) {
				primaryEntry.updatedAt = now;
				await this.writeEntriesByPath(annotationPath, existingEntries);
			}
			return toAnnotationCard(primaryEntry, annotationPath);
		}

		const nextEntry: AnnotationEntry = {
			id: `anno-${now}-${buildRandomToken(6)}`,
			title: title.trim() || DEFAULT_ANNOTATION_TITLE,
			content: "",
			sourcePath: normalizedSourcePath,
			anchorOffset: selectionStart,
			anchorEndOffset: selectionEnd,
			line: Math.max(0, Math.round(selection.line)),
			ch: Math.max(0, Math.round(selection.ch)),
			colorHex: nextColorHex,
			createdAt: now,
			updatedAt: now,
		};
		existingEntries.push(nextEntry);
		await this.writeEntriesByPath(annotationPath, existingEntries);
		return toAnnotationCard(nextEntry, annotationPath);
	}

	async saveCard(card: AnnotationCard): Promise<void> {
		const annotationPath = this.novelLibraryService.normalizeVaultPath(card.annoPath);
		const entry = this.app.vault.getAbstractFileByPath(annotationPath);
		if (!(entry instanceof TFile)) {
			throw new Error(`Annotation file not found: ${annotationPath}`);
		}
		const existingEntries = await this.readEntriesByPath(annotationPath);
		const index = existingEntries.findIndex((item) => item.id === card.id);
		const nextEntry: AnnotationEntry = {
			id: card.id,
			title: normalizeEntryTitle(card.title),
			content: card.content.replace(/\r\n?/g, "\n"),
			sourcePath: this.novelLibraryService.normalizeVaultPath(card.sourcePath),
			anchorOffset: Math.max(0, Math.round(card.anchorOffset)),
			anchorEndOffset: Math.max(Math.max(0, Math.round(card.anchorOffset)) + 1, Math.round(card.anchorEndOffset)),
			line: Math.max(0, Math.round(card.line)),
			ch: Math.max(0, Math.round(card.ch)),
			colorHex: parseColorHex(card.colorHex),
			createdAt: Math.max(0, Math.round(card.createdAt)),
			updatedAt: Math.max(0, Math.round(card.updatedAt)),
		};
		if (index < 0) {
			existingEntries.push(nextEntry);
		} else {
			existingEntries[index] = nextEntry;
		}
		await this.writeEntriesByPath(annotationPath, existingEntries);
	}

	async deleteCard(card: AnnotationCard): Promise<void> {
		const annotationPath = this.novelLibraryService.normalizeVaultPath(card.annoPath);
		const entry = this.app.vault.getAbstractFileByPath(annotationPath);
		if (!(entry instanceof TFile)) {
			return;
		}
		const existingEntries = await this.readEntriesByPath(annotationPath);
		const nextEntries = existingEntries.filter((item) => item.id !== card.id);
		if (nextEntries.length <= 0) {
			await this.app.fileManager.trashFile(entry);
			return;
		}
		await this.writeEntriesByPath(annotationPath, nextEntries);
	}

	async getAnchorsForSourcePath(settings: SettingDatas, sourcePath: string): Promise<Map<string, AnnotationAnchorSnapshot>> {
		const normalizedSourcePath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		const annotationPath = this.resolveAnnotationPathBySourcePath(settings, normalizedSourcePath);
		if (!annotationPath) {
			return new Map();
		}
		const entries = await this.readEntriesByPath(annotationPath);
		const anchors = new Map<string, AnnotationAnchorSnapshot>();
		for (const entry of entries) {
			if (entry.sourcePath !== normalizedSourcePath) {
				continue;
			}
			anchors.set(entry.id, {
				anchorOffset: entry.anchorOffset,
				anchorEndOffset: entry.anchorEndOffset,
				line: entry.line,
				ch: entry.ch,
				colorHex: normalizeAnnotationColorHex(entry.colorHex),
			});
		}
		return anchors;
	}

	async patchAnchorsForSourcePath(
		settings: SettingDatas,
		sourcePath: string,
		snapshots: Map<string, AnnotationAnchorSnapshot>,
	): Promise<void> {
		const normalizedSourcePath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		const annotationPath = this.resolveAnnotationPathBySourcePath(settings, normalizedSourcePath);
		if (!annotationPath) {
			return;
		}
		const entry = this.app.vault.getAbstractFileByPath(annotationPath);
		if (!(entry instanceof TFile)) {
			return;
		}
		let changed = false;
		await this.app.vault.process(entry, (raw) => {
			const parsedEntries = parseAnnotationEntries(raw, this.novelLibraryService);
			const nextEntries: AnnotationEntry[] = [];
			for (const parsedEntry of parsedEntries) {
				if (parsedEntry.sourcePath !== normalizedSourcePath) {
					nextEntries.push(parsedEntry);
					continue;
				}
				const snapshot = snapshots.get(parsedEntry.id);
				if (!snapshot) {
					changed = true;
					continue;
				}
				const nextStart = Math.max(0, Math.round(snapshot.anchorOffset));
				const nextEnd = Math.max(nextStart + 1, Math.round(snapshot.anchorEndOffset));
				const nextEntry: AnnotationEntry = {
					...parsedEntry,
					anchorOffset: nextStart,
					anchorEndOffset: nextEnd,
					line: Math.max(0, Math.round(snapshot.line)),
					ch: Math.max(0, Math.round(snapshot.ch)),
				};
				if (
					parsedEntry.anchorOffset !== nextEntry.anchorOffset ||
					parsedEntry.anchorEndOffset !== nextEntry.anchorEndOffset ||
					parsedEntry.line !== nextEntry.line ||
					parsedEntry.ch !== nextEntry.ch
				) {
					changed = true;
				}
				nextEntries.push(nextEntry);
			}
			if (!changed) {
				return raw;
			}
			return serializeAnnotationEntries(nextEntries);
		});
	}

	async migrateSourcePath(settings: SettingDatas, oldSourcePath: string, newSourcePath: string): Promise<void> {
		const normalizedOldSourcePath = this.novelLibraryService.normalizeVaultPath(oldSourcePath);
		const normalizedNewSourcePath = this.novelLibraryService.normalizeVaultPath(newSourcePath);
		const oldAnnotationPath = this.resolveAnnotationPathBySourcePath(settings, normalizedOldSourcePath);
		const newAnnotationPath = this.resolveAnnotationPathBySourcePath(settings, normalizedNewSourcePath);
		if (!oldAnnotationPath || !newAnnotationPath) {
			return;
		}
		const oldEntry = this.app.vault.getAbstractFileByPath(oldAnnotationPath);
		if (!(oldEntry instanceof TFile)) {
			return;
		}
		const oldEntries = await this.readEntriesByPath(oldAnnotationPath);
		const migratedEntries = oldEntries.map((entry) =>
			entry.sourcePath === normalizedOldSourcePath
				? {
					...entry,
					sourcePath: normalizedNewSourcePath,
				}
				: entry,
		);
		if (oldAnnotationPath === newAnnotationPath) {
			await this.writeEntriesByPath(oldAnnotationPath, migratedEntries);
			return;
		}

		const mergedEntries = await this.mergeEntriesForTargetPath(newAnnotationPath, migratedEntries);
		await this.ensureParentFolder(newAnnotationPath);
		const targetEntry = this.app.vault.getAbstractFileByPath(newAnnotationPath);
		if (targetEntry instanceof TFile) {
			await this.app.vault.process(targetEntry, () => serializeAnnotationEntries(mergedEntries));
		} else {
			await this.app.vault.create(newAnnotationPath, serializeAnnotationEntries(mergedEntries));
		}
		await this.app.fileManager.trashFile(oldEntry);
	}

	async deleteAnnotationFileBySourcePath(settings: SettingDatas, sourcePath: string): Promise<void> {
		const normalizedSourcePath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		const annotationPath = this.resolveAnnotationPathBySourcePath(settings, normalizedSourcePath);
		if (!annotationPath) {
			return;
		}
		const entry = this.app.vault.getAbstractFileByPath(annotationPath);
		if (!(entry instanceof TFile)) {
			return;
		}
		await this.app.fileManager.trashFile(entry);
	}

	private resolveAnnotationRoots(settings: SettingDatas, preferredRootPaths?: string[]): string[] {
		if (preferredRootPaths !== undefined) {
			return Array.from(
				new Set(
					preferredRootPaths
						.map((path) => this.novelLibraryService.normalizeVaultPath(path))
						.filter((path) => path.length > 0),
				),
			);
		}
		return this.resolveAnnotationRootPaths(settings);
	}

	private async mergeEntriesForTargetPath(path: string, nextEntries: AnnotationEntry[]): Promise<AnnotationEntry[]> {
		const existingEntries = await this.readEntriesByPath(path);
		if (existingEntries.length === 0) {
			return nextEntries;
		}
		const mergedById = new Map<string, AnnotationEntry>();
		for (const item of existingEntries) {
			mergedById.set(item.id, item);
		}
		for (const item of nextEntries) {
			mergedById.set(item.id, item);
		}
		return Array.from(mergedById.values());
	}

	private async readCardsFromAnnotationFile(file: TFile): Promise<AnnotationCard[]> {
		const raw = await this.app.vault.cachedRead(file);
		const entries = parseAnnotationEntries(raw, this.novelLibraryService, file.path);
		const sourceTextCache = new Map<string, string>();
		return Promise.all(entries.map(async (entry) => {
			const sourceText = await this.readSourceText(entry.sourcePath, sourceTextCache);
			return toAnnotationCard(entry, file.path, sourceText);
		}));
	}

	private async readSourceText(sourcePath: string, cache: Map<string, string>): Promise<string> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(sourcePath);
		if (!normalizedPath) {
			return "";
		}
		const cached = cache.get(normalizedPath);
		if (cached !== undefined) {
			return cached;
		}
		const liveEditorText = this.readSourceTextFromOpenEditor(normalizedPath);
		if (liveEditorText !== null) {
			cache.set(normalizedPath, liveEditorText);
			return liveEditorText;
		}
		const sourceEntry = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(sourceEntry instanceof TFile)) {
			cache.set(normalizedPath, "");
			return "";
		}
		const content = await this.app.vault.cachedRead(sourceEntry);
		cache.set(normalizedPath, content);
		return content;
	}

	private readSourceTextFromOpenEditor(sourcePath: string): string | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				continue;
			}
			const openedPath = this.novelLibraryService.normalizeVaultPath(view.file?.path ?? "");
			if (openedPath !== sourcePath) {
				continue;
			}
			const editorView = resolveEditorViewFromMarkdownView(view);
			if (!editorView) {
				continue;
			}
			return editorView.state.doc.toString();
		}
		return null;
	}

	private async readEntriesByPath(path: string): Promise<AnnotationEntry[]> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const entry = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(entry instanceof TFile)) {
			return [];
		}
		const raw = await this.app.vault.cachedRead(entry);
		return parseAnnotationEntries(raw, this.novelLibraryService, normalizedPath);
	}

	private async writeEntriesByPath(path: string, entries: AnnotationEntry[]): Promise<void> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		const serialized = serializeAnnotationEntries(entries);
		if (existing instanceof TFile) {
			await this.app.vault.process(existing, () => serialized);
			return;
		}
		await this.ensureParentFolder(normalizedPath);
		await this.app.vault.create(normalizedPath, serialized);
	}

	private async ensureParentFolder(path: string): Promise<void> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const slashIndex = normalizedPath.lastIndexOf("/");
		if (slashIndex < 0) {
			return;
		}
		const folderPath = normalizedPath.slice(0, slashIndex);
		if (!folderPath) {
			return;
		}
		await this.novelLibraryService.ensureFolderPath(folderPath);
	}
}

function parseAnnotationEntries(
	source: string,
	novelLibraryService: NovelLibraryService,
	pathHint?: string,
): AnnotationEntry[] {
	const normalized = source.replace(/\r\n?/g, "\n").trim();
	if (!normalized) {
		return [];
	}

	const blockMatch = normalized.match(/^\uFEFF?\s*<!---(cna-data)\s*([\s\S]*?)\s*--->/i);
	if (!blockMatch) {
		throw new AnnotationJsonParseError(
			`Annotation cna-data block is missing${pathHint ? ` for ${pathHint}` : ""}.`,
		);
	}
	const blockJsonSource = blockMatch[2]?.trim() ?? "";
	if (!blockJsonSource) {
		return [];
	}
	const blockPayload = parseJsonOrThrow(blockJsonSource, "annotation cna-data", pathHint);
	if (!isRecord(blockPayload)) {
		throw new AnnotationJsonParseError(
			`Annotation cna-data must be an object${pathHint ? ` for ${pathHint}` : ""}.`,
		);
	}
	const listPayload = blockPayload["annotations"];
	if (listPayload === undefined || listPayload === null) {
		return [];
	}
	if (!Array.isArray(listPayload)) {
		throw new AnnotationJsonParseError(
			`Annotation cna-data.annotations must be an array${pathHint ? ` for ${pathHint}` : ""}.`,
		);
	}
	return parseAnnotationEntryArray(listPayload, novelLibraryService);
}

function parseAnnotationEntryArray(rawEntries: unknown[], novelLibraryService: NovelLibraryService): AnnotationEntry[] {
	const entries: AnnotationEntry[] = [];
	for (const item of rawEntries) {
		const entry = parseAnnotationEntry(item, novelLibraryService);
		if (!entry) {
			continue;
		}
		entries.push(entry);
	}
	return entries;
}

function parseJsonOrThrow(source: string, label: string, pathHint?: string): unknown {
	try {
		return JSON.parse(source);
	} catch {
		throw new AnnotationJsonParseError(`Invalid ${label} format${pathHint ? ` for ${pathHint}` : ""}.`);
	}
}

function parseAnnotationEntry(raw: unknown, novelLibraryService: NovelLibraryService): AnnotationEntry | null {
	if (!isRecord(raw)) {
		return null;
	}
	const id = typeof raw["id"] === "string" ? raw["id"].trim() : "";
	if (!id) {
		return null;
	}
	const sourcePath = typeof raw["sourcePath"] === "string"
		? novelLibraryService.normalizeVaultPath(raw["sourcePath"])
		: "";
	if (!sourcePath) {
		return null;
	}
	const title = normalizeEntryTitle(typeof raw["title"] === "string" ? raw["title"] : "");
	const content = typeof raw["content"] === "string" ? raw["content"].replace(/\r\n?/g, "\n") : "";
	const anchorOffset = Math.max(0, Math.round(asNumber(raw["anchorOffset"], 0)));
	const anchorEndOffset = Math.max(anchorOffset + 1, Math.round(asNumber(raw["anchorEndOffset"], anchorOffset + 1)));
	const line = Math.max(0, Math.round(asNumber(raw["line"], 0)));
	const ch = Math.max(0, Math.round(asNumber(raw["ch"], 0)));
	const colorHex = parseColorHex(raw["colorHex"]);
	const createdAt = Math.max(0, Math.round(asNumber(raw["createdAt"], 0)));
	const updatedAt = Math.max(0, Math.round(asNumber(raw["updatedAt"], createdAt)));
	return {
		id,
		title,
		content,
		sourcePath,
		anchorOffset,
		anchorEndOffset,
		line,
		ch,
		colorHex,
		createdAt,
		updatedAt,
	};
}

function serializeAnnotationEntries(entries: AnnotationEntry[]): string {
	const serializable = entries.map((entry) => ({
		id: entry.id,
		title: normalizeEntryTitle(entry.title),
		content: entry.content.replace(/\r\n?/g, "\n"),
		sourcePath: entry.sourcePath,
		anchorOffset: Math.max(0, Math.round(entry.anchorOffset)),
		anchorEndOffset: Math.max(Math.max(0, Math.round(entry.anchorOffset)) + 1, Math.round(entry.anchorEndOffset)),
		line: Math.max(0, Math.round(entry.line)),
		ch: Math.max(0, Math.round(entry.ch)),
		colorHex: parseColorHex(entry.colorHex),
		createdAt: Math.max(0, Math.round(entry.createdAt)),
		updatedAt: Math.max(0, Math.round(entry.updatedAt)),
	}));
	const payload = {
		warning: ANNOTATION_DATA_BLOCK_WARNING_TEXT,
		annotations: serializable,
	};
	return `<!---${ANNOTATION_DATA_BLOCK_NAME}\n${JSON.stringify(payload, null, 2)}\n--->\n`;
}

function normalizeEntryTitle(title: string): string {
	const normalized = title.trim();
	return normalized.length > 0 ? normalized : DEFAULT_ANNOTATION_TITLE;
}

function toAnnotationCard(entry: AnnotationEntry, annoPath: string, sourceText = ""): AnnotationCard {
	return {
		...entry,
		annoPath,
		contentPlainText: extractPlainTextFromMarkdown(entry.content),
		anchorText: extractAnchorTextByOffsets(sourceText, entry.anchorOffset, entry.anchorEndOffset),
	};
}

function extractAnchorTextByOffsets(sourceText: string, fromOffset: number, toOffset: number): string {
	if (!sourceText) {
		return "";
	}
	const sourceLength = sourceText.length;
	const from = Math.max(0, Math.min(sourceLength, Math.round(fromOffset)));
	const to = Math.max(from, Math.min(sourceLength, Math.round(toOffset)));
	if (to <= from) {
		return "";
	}
	const rawText = sourceText.slice(from, to);
	const oneLine = rawText.replace(/\r\n?/g, "\n").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
	if (oneLine.length <= 160) {
		return oneLine;
	}
	return oneLine.slice(0, 160);
}

function isConnectedRange(existingStart: number, existingEnd: number, nextStart: number, nextEnd: number): boolean {
	return nextStart <= existingEnd && nextEnd >= existingStart;
}

function compareEntriesByRangeStart(left: AnnotationEntry, right: AnnotationEntry): number {
	if (left.anchorOffset !== right.anchorOffset) {
		return left.anchorOffset - right.anchorOffset;
	}
	if (left.anchorEndOffset !== right.anchorEndOffset) {
		return left.anchorEndOffset - right.anchorEndOffset;
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left.id.localeCompare(right.id);
}




