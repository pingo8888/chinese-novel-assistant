import { TFile, type App } from "obsidian";
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
} from "../../utils";
import type { TimelineCard, TimelineEntry } from "./views/types";
import { TIMELINE_DEFAULT_COLOR } from "./color-types";

const TIMELINE_FILE_SUFFIX = ".timeline.md";
const TIMELINE_DATA_BLOCK_WARNING_TEXT = "数据由时间轴功能管理，请勿删除或手动修改";
const TIMELINE_DATA_BLOCK_NAME = "cna-data";

interface CreateTimelineCardOptions {
	timelinePath?: string | null;
	referenceCardId?: string | null;
	position?: "before" | "after" | "end";
}

class TimelineJsonParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TimelineJsonParseError";
	}
}

export class TimelineRepository {
	private readonly app: App;
	private readonly novelLibraryService: NovelLibraryService;

	constructor(app: App, novelLibraryService?: NovelLibraryService) {
		this.app = app;
		this.novelLibraryService = novelLibraryService ?? new NovelLibraryService(app);
	}

	resolveTimelineRootPaths(settings: SettingDatas): string[] {
		const roots = settings.novelLibraries
			.map((libraryPath) => this.resolveTimelineRootPathByLibraryRoot(libraryPath))
			.map((path) => this.novelLibraryService.normalizeVaultPath(path))
			.filter((path) => path.length > 0);
		return Array.from(new Set(roots));
	}

	resolveScopedTimelineRootPaths(settings: SettingDatas, preferredFilePath?: string | null): string[] {
		const allRoots = this.resolveTimelineRootPaths(settings);
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
		const timelineRootPath = this.resolveTimelineRootPathByLibraryRoot(matchedLibraryRoot);
		const normalizedTimelineRootPath = this.novelLibraryService.normalizeVaultPath(timelineRootPath);
		return normalizedTimelineRootPath ? [normalizedTimelineRootPath] : allRoots;
	}

	resolveTargetTimelinePath(settings: SettingDatas, preferredFilePath?: string | null): string | null {
		const normalizedLibraryRoots = this.novelLibraryService.normalizeLibraryRoots(settings.novelLibraries);
		if (normalizedLibraryRoots.length === 0) {
			return null;
		}
		const referencePath = typeof preferredFilePath === "string" ? preferredFilePath : "";
		const matchedLibraryRoot = referencePath
			? this.novelLibraryService.resolveContainingLibraryRoot(referencePath, normalizedLibraryRoots)
			: null;
		const targetLibraryRoot = matchedLibraryRoot ?? normalizedLibraryRoots[0] ?? "";
		if (!targetLibraryRoot) {
			return null;
		}
		return this.resolveTimelinePathByLibraryRoot(targetLibraryRoot);
	}

	async listCards(settings: SettingDatas, rootPaths?: string[]): Promise<TimelineCard[]> {
		const timelineRoots = this.resolveTimelineRoots(settings, rootPaths);
		if (timelineRoots.length === 0) {
			return [];
		}
		const markdownFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.toLowerCase().endsWith(TIMELINE_FILE_SUFFIX))
			.filter((file) => timelineRoots.some((rootPath) => this.novelLibraryService.isSameOrChildPath(file.path, rootPath)));
		const cardsNested = await Promise.all(markdownFiles.map((file) => this.readCardsFromTimelineFile(file)));
		const cards: TimelineCard[] = [];
		for (const group of cardsNested) {
			cards.push(...group);
		}
		return cards;
	}

	async getCardsByTimelinePath(path: string): Promise<TimelineCard[]> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const entry = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(entry instanceof TFile) || !normalizedPath.toLowerCase().endsWith(TIMELINE_FILE_SUFFIX)) {
			return [];
		}
		return this.readCardsFromTimelineFile(entry);
	}

	async createCard(
		settings: SettingDatas,
		preferredFilePath?: string | null,
		options?: CreateTimelineCardOptions,
	): Promise<TimelineCard> {
		const explicitTimelinePath = this.novelLibraryService.normalizeVaultPath(options?.timelinePath ?? "");
		const targetTimelinePath = explicitTimelinePath || this.resolveTargetTimelinePath(settings, preferredFilePath);
		if (!targetTimelinePath) {
			throw new Error("Cannot resolve target timeline path.");
		}
		await this.ensureParentFolder(targetTimelinePath);
		const entries = await this.readEntriesByPath(targetTimelinePath);
		const now = Date.now();
		const nextEntry: TimelineEntry = {
			id: `timeline-${now}-${buildRandomToken(6)}`,
			timeText: "",
			title: "",
			content: "",
			colorHex: TIMELINE_DEFAULT_COLOR,
			order: 0,
			createdAt: now,
			updatedAt: now,
		};
		const insertIndex = resolveInsertIndex(entries, options?.referenceCardId, options?.position ?? "end");
		entries.splice(insertIndex, 0, nextEntry);
		await this.writeEntriesByPath(targetTimelinePath, entries);
		return toTimelineCard(nextEntry, targetTimelinePath);
	}

	async saveCard(card: TimelineCard): Promise<void> {
		const timelinePath = this.novelLibraryService.normalizeVaultPath(card.timelinePath);
		const entry = this.app.vault.getAbstractFileByPath(timelinePath);
		if (!(entry instanceof TFile)) {
			throw new Error(`Timeline file not found: ${timelinePath}`);
		}
		const existingEntries = await this.readEntriesByPath(timelinePath);
		const index = existingEntries.findIndex((item) => item.id === card.id);
		const nextEntry: TimelineEntry = {
			id: card.id,
			timeText: normalizeTimelineText(card.timeText),
			title: normalizeTimelineText(card.title),
			content: card.content.replace(/\r\n?/g, "\n"),
			colorHex: parseColorHex(card.colorHex),
			order: Math.max(0, Math.round(card.order)),
			createdAt: Math.max(0, Math.round(card.createdAt)),
			updatedAt: Math.max(0, Math.round(card.updatedAt)),
		};
		if (index < 0) {
			existingEntries.push(nextEntry);
		} else {
			existingEntries[index] = nextEntry;
		}
		await this.writeEntriesByPath(timelinePath, existingEntries);
	}

	async deleteCard(card: TimelineCard): Promise<void> {
		const timelinePath = this.novelLibraryService.normalizeVaultPath(card.timelinePath);
		const entry = this.app.vault.getAbstractFileByPath(timelinePath);
		if (!(entry instanceof TFile)) {
			return;
		}
		const existingEntries = await this.readEntriesByPath(timelinePath);
		const nextEntries = existingEntries.filter((item) => item.id !== card.id);
		if (nextEntries.length <= 0) {
			await this.app.fileManager.trashFile(entry);
			return;
		}
		await this.writeEntriesByPath(timelinePath, nextEntries);
	}

	async reorderCards(timelinePath: string, orderedCardIds: string[]): Promise<void> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(timelinePath);
		const entry = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(entry instanceof TFile)) {
			return;
		}
		const existingEntries = await this.readEntriesByPath(normalizedPath);
		if (existingEntries.length <= 1) {
			return;
		}
		const entryById = new Map<string, TimelineEntry>();
		for (const item of existingEntries) {
			entryById.set(item.id, item);
		}
		const ordered: TimelineEntry[] = [];
		for (const id of orderedCardIds) {
			const matched = entryById.get(id);
			if (!matched) {
				continue;
			}
			ordered.push(matched);
			entryById.delete(id);
		}
		const remaining = Array.from(entryById.values()).sort(compareEntriesByOrder);
		const nextEntries = [...ordered, ...remaining];
		await this.writeEntriesByPath(normalizedPath, nextEntries);
	}

	private resolveTimelineRoots(settings: SettingDatas, preferredRootPaths?: string[]): string[] {
		if (preferredRootPaths !== undefined) {
			return Array.from(
				new Set(
					preferredRootPaths
						.map((path) => this.novelLibraryService.normalizeVaultPath(path))
						.filter((path) => path.length > 0),
				),
			);
		}
		return this.resolveTimelineRootPaths(settings);
	}

	private resolveTimelineRootPathByLibraryRoot(libraryRoot: string): string {
		return this.novelLibraryService.resolveNovelLibrarySubdirPath(
			libraryRoot,
			NOVEL_LIBRARY_SUBDIR_NAMES.timeline,
		);
	}

	private resolveTimelinePathByLibraryRoot(libraryRoot: string): string {
		const normalizedLibraryRoot = this.novelLibraryService.normalizeVaultPath(libraryRoot);
		if (!normalizedLibraryRoot) {
			return "";
		}
		const timelineRootPath = this.resolveTimelineRootPathByLibraryRoot(normalizedLibraryRoot);
		const normalizedTimelineRootPath = this.novelLibraryService.normalizeVaultPath(timelineRootPath);
		if (!normalizedTimelineRootPath) {
			return "";
		}
		const segments = normalizedLibraryRoot.split("/").filter((segment) => segment.length > 0);
		const libraryName = segments[segments.length - 1] ?? "timeline";
		return this.novelLibraryService.normalizeVaultPath(
			`${normalizedTimelineRootPath}/${libraryName}${TIMELINE_FILE_SUFFIX}`,
		);
	}

	private async readCardsFromTimelineFile(file: TFile): Promise<TimelineCard[]> {
		const raw = await this.app.vault.cachedRead(file);
		const entries = parseTimelineEntries(raw, file.path);
		return entries.map((entry) => toTimelineCard(entry, file.path));
	}

	private async readEntriesByPath(path: string): Promise<TimelineEntry[]> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const entry = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(entry instanceof TFile)) {
			return [];
		}
		const raw = await this.app.vault.cachedRead(entry);
		return parseTimelineEntries(raw, normalizedPath);
	}

	private async writeEntriesByPath(path: string, entries: TimelineEntry[]): Promise<void> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		const normalizedEntries = [...entries];
		normalizeEntriesOrder(normalizedEntries);
		const serialized = serializeTimelineEntries(normalizedEntries);
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

function resolveInsertIndex(entries: TimelineEntry[], referenceCardId: string | null | undefined, position: "before" | "after" | "end"): number {
	if (position === "end") {
		return entries.length;
	}
	const referenceId = typeof referenceCardId === "string" ? referenceCardId.trim() : "";
	if (!referenceId) {
		return entries.length;
	}
	const index = entries.findIndex((item) => item.id === referenceId);
	if (index < 0) {
		return entries.length;
	}
	return position === "before" ? index : index + 1;
}

function normalizeEntriesOrder(entries: TimelineEntry[]): void {
	for (let index = 0; index < entries.length; index += 1) {
		const item = entries[index];
		if (!item) {
			continue;
		}
		item.order = (index + 1) * 1024;
	}
}

function parseTimelineEntries(source: string, pathHint?: string): TimelineEntry[] {
	const normalized = source.replace(/\r\n?/g, "\n").trim();
	if (!normalized) {
		return [];
	}
	const blockMatch = normalized.match(/^\uFEFF?\s*<!---(cna-data)\s*([\s\S]*?)\s*--->/i);
	if (!blockMatch) {
		throw new TimelineJsonParseError(
			`Timeline cna-data block is missing${pathHint ? ` for ${pathHint}` : ""}.`,
		);
	}
	const blockJsonSource = blockMatch[2]?.trim() ?? "";
	if (!blockJsonSource) {
		return [];
	}
	const blockPayload = parseJsonOrThrow(blockJsonSource, "timeline cna-data", pathHint);
	if (!isRecord(blockPayload)) {
		throw new TimelineJsonParseError(
			`Timeline cna-data must be an object${pathHint ? ` for ${pathHint}` : ""}.`,
		);
	}
	const listPayload = blockPayload["timelines"];
	if (listPayload === undefined || listPayload === null) {
		return [];
	}
	if (!Array.isArray(listPayload)) {
		throw new TimelineJsonParseError(
			`Timeline cna-data.timelines must be an array${pathHint ? ` for ${pathHint}` : ""}.`,
		);
	}
	return parseTimelineEntryArray(listPayload);
}

function parseTimelineEntryArray(rawEntries: unknown[]): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	for (let index = 0; index < rawEntries.length; index += 1) {
		const item = rawEntries[index];
		const entry = parseTimelineEntry(item, index);
		if (!entry) {
			continue;
		}
		entries.push(entry);
	}
	return entries.sort(compareEntriesByOrder);
}

function parseTimelineEntry(raw: unknown, index: number): TimelineEntry | null {
	if (!isRecord(raw)) {
		return null;
	}
	const id = typeof raw["id"] === "string" ? raw["id"].trim() : "";
	if (!id) {
		return null;
	}
	const timeText = normalizeTimelineText(typeof raw["timeText"] === "string" ? raw["timeText"] : "");
	const title = normalizeTimelineText(typeof raw["title"] === "string" ? raw["title"] : "");
	const content = typeof raw["content"] === "string" ? raw["content"].replace(/\r\n?/g, "\n") : "";
	const colorHex = parseColorHex(raw["colorHex"]);
	const order = Math.max(0, Math.round(asNumber(raw["order"], (index + 1) * 1024)));
	const createdAt = Math.max(0, Math.round(asNumber(raw["createdAt"], 0)));
	const updatedAt = Math.max(0, Math.round(asNumber(raw["updatedAt"], createdAt)));
	return {
		id,
		timeText,
		title,
		content,
		colorHex,
		order,
		createdAt,
		updatedAt,
	};
}

function parseJsonOrThrow(source: string, label: string, pathHint?: string): unknown {
	try {
		return JSON.parse(source);
	} catch {
		throw new TimelineJsonParseError(`Invalid ${label} format${pathHint ? ` for ${pathHint}` : ""}.`);
	}
}

function serializeTimelineEntries(entries: TimelineEntry[]): string {
	const serializable = entries.map((entry) => ({
		id: entry.id,
		timeText: normalizeTimelineText(entry.timeText),
		title: normalizeTimelineText(entry.title),
		content: entry.content.replace(/\r\n?/g, "\n"),
		colorHex: parseColorHex(entry.colorHex),
		order: Math.max(0, Math.round(entry.order)),
		createdAt: Math.max(0, Math.round(entry.createdAt)),
		updatedAt: Math.max(0, Math.round(entry.updatedAt)),
	}));
	const payload = {
		warning: TIMELINE_DATA_BLOCK_WARNING_TEXT,
		timelines: serializable,
	};
	return `<!---${TIMELINE_DATA_BLOCK_NAME}\n${JSON.stringify(payload, null, 2)}\n--->\n`;
}

function toTimelineCard(entry: TimelineEntry, timelinePath: string): TimelineCard {
	return {
		...entry,
		timelinePath,
		contentPlainText: extractPlainTextFromMarkdown(entry.content),
	};
}

function normalizeTimelineText(value: string): string {
	return value.replace(/\r\n?/g, "\n").trim();
}

function compareEntriesByOrder(left: TimelineEntry, right: TimelineEntry): number {
	if (left.order !== right.order) {
		return left.order - right.order;
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left.id.localeCompare(right.id);
}
