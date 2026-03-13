import { TFile, TFolder, type App } from "obsidian";
import type { SettingDatas } from "../../core/setting-datas";

import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../services/novel-library-service";
import type { StickyNoteCardModel, StickyNoteImageModel } from "../../ui/views/sticky-note/types";
import { extractPlainTextFromMarkdown, normalizeMarkdownLineEndings } from "../../utils/markdown-text";

import { STICKY_NOTE_COLORS } from "../../core/constants";
import {
	STICKY_NOTE_FLOAT_DEFAULT_HEIGHT,
	STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
} from "./index";

const STICKY_NOTE_WARNING_TEXT = "数据由灵感便签管理，请勿删除或手动修改";
const STICKY_NOTE_DEFAULT_COLOR = "#9CA3AF";

type StickyNoteFileData = Record<string, unknown>;

// 单便签文件的解析结果
interface ParseStickyNoteResult {
	data: StickyNoteFileData;		// 便签元数据
	contentMarkdown: string;		// 便签内容
}

// 创建浮动便签时的数据
interface CreateStickyNoteFileOptions {
	isFloating?: boolean;
	floatX?: number;
	floatY?: number;
	floatW?: number;
	floatH?: number;
}

export class StickyNoteRepository {
	private readonly app: App;
	private readonly novelLibraryService: NovelLibraryService;

	constructor(app: App) {
		this.app = app;
		this.novelLibraryService = new NovelLibraryService(app);
	}

	async listCards(settings: SettingDatas, rootPaths?: string[]): Promise<StickyNoteCardModel[]> {
		const stickyRoots = this.resolveStickyRoots(settings, rootPaths);
		if (stickyRoots.length === 0) {
			return [];
		}
		const markdownFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => stickyRoots.some((root) => this.novelLibraryService.isSameOrChildPath(file.path, root)));
		const cards = await Promise.all(
			markdownFiles.map((file) => this.readCardFromFile(file)),
		);
		return cards.filter((card): card is StickyNoteCardModel => card !== null);
	}

	async getCardByPath(path: string): Promise<StickyNoteCardModel | null> {
		const entry = this.app.vault.getAbstractFileByPath(path);
		if (!(entry instanceof TFile) || !entry.path.toLowerCase().endsWith(".md")) {
			return null;
		}
		return this.readCardFromFile(entry);
	}

	async createCardFile(stickyRootPath: string, options?: CreateStickyNoteFileOptions): Promise<TFile> {
		const normalizedRootPath = this.novelLibraryService.normalizeVaultPath(stickyRootPath);
		if (!normalizedRootPath) {
			throw new Error("Invalid sticky note root path.");
		}
		await this.ensureFolderPath(normalizedRootPath);
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const fileBaseName = buildStickyNoteFileBaseName(new Date());
			const filePath = `${normalizedRootPath}/${fileBaseName}.md`;
			if (this.app.vault.getAbstractFileByPath(filePath)) {
				continue;
			}
			return this.app.vault.create(filePath, buildDefaultStickyNoteFileContent(options));
		}
		throw new Error("Failed to create unique sticky note file name.");
	}

	async saveCard(card: StickyNoteCardModel): Promise<void> {
		const entry = this.app.vault.getAbstractFileByPath(card.sourcePath);
		if (!(entry instanceof TFile)) {
			throw new Error(`Sticky note file not found: ${card.sourcePath}`);
		}
		const nextContent = serializeStickyNoteFile(card, this.novelLibraryService);
		await this.app.vault.process(entry, () => nextContent);
		const latest = this.app.vault.getAbstractFileByPath(card.sourcePath);
		if (latest instanceof TFile) {
			card.createdAt = latest.stat.ctime;
			card.updatedAt = latest.stat.mtime;
		}
	}

	async deleteCard(card: StickyNoteCardModel): Promise<void> {
		const entry = this.app.vault.getAbstractFileByPath(card.sourcePath);
		if (!(entry instanceof TFile)) {
			return;
		}
		await this.app.fileManager.trashFile(entry);
	}

	private resolveStickyRoots(settings: SettingDatas, preferredRootPaths?: string[]): string[] {
		// `undefined` means "use all libraries"; an explicit empty array means "no scope".
		if (preferredRootPaths !== undefined) {
			return Array.from(
				new Set(
					preferredRootPaths
						.map((path) => this.novelLibraryService.normalizeVaultPath(path))
						.filter((path) => path.length > 0),
				),
			);
		}
		const roots = settings.novelLibraries
			.map((libraryPath) =>
				this.novelLibraryService.resolveNovelLibrarySubdirPath(
					settings,
					libraryPath,
					NOVEL_LIBRARY_SUBDIR_NAMES.stickyNote,
				),
			)
			.map((path) => this.novelLibraryService.normalizeVaultPath(path))
			.filter((path) => path.length > 0);
		return Array.from(new Set(roots));
	}

	private async readCardFromFile(file: TFile): Promise<StickyNoteCardModel | null> {
		try {
			const raw = await this.app.vault.cachedRead(file);
			const parsed = parseStickyNoteFile(raw);
			const imagePaths = parseCsvPaths(parsed.data["images"], (value) => this.novelLibraryService.normalizeVaultPath(value));
			const images = this.resolveImageModels(file.path, imagePaths);
			const contentMarkdown = normalizeMarkdownLineEndings(parsed.contentMarkdown);
			return {
				id: file.path,
				sourcePath: file.path,
				cwData: { ...parsed.data },
				createdAt: file.stat.ctime,
				updatedAt: file.stat.mtime,
				contentMarkdown,
				contentPlainText: extractPlainTextFromMarkdown(contentMarkdown),
				tagsText: parseTagsToText(parsed.data["tags"]),
				images,
				isImageExpanded: asBoolean(parsed.data["isimageexpanded"], false),
				isPinned: asBoolean(parsed.data["ispinned"], false),
				colorHex: parseColorHex(parsed.data["color"]),
				isFloating: asBoolean(parsed.data["isfloating"], false),
				floatX: asNumber(parsed.data["floatx"], 0),
				floatY: asNumber(parsed.data["floaty"], 0),
				floatW: asNumber(parsed.data["floatw"], STICKY_NOTE_FLOAT_DEFAULT_WIDTH),
				floatH: asNumber(parsed.data["floath"], STICKY_NOTE_FLOAT_DEFAULT_HEIGHT),
			};
		} catch {
			return null;
		}
	}

	private resolveImageModels(notePath: string, imagePaths: string[]): StickyNoteImageModel[] {
		const models: StickyNoteImageModel[] = [];
		for (let index = 0; index < imagePaths.length; index += 1) {
			const path = imagePaths[index];
			if (!path) {
				continue;
			}
			const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
			const entry = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!(entry instanceof TFile)) {
				continue;
			}
			models.push({
				id: `${notePath}::image::${index}`,
				src: this.app.vault.getResourcePath(entry),
				name: entry.name,
				revokeOnDestroy: false,
				vaultPath: normalizedPath,
			});
		}
		return models;
	}

	private async ensureFolderPath(path: string): Promise<void> {
		const normalizedPath = this.novelLibraryService.normalizeVaultPath(path);
		if (!normalizedPath) {
			return;
		}
		const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
		let currentPath = "";
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
				continue;
			}
			if (existing instanceof TFolder) {
				continue;
			}
			throw new Error(`Path already exists as file: ${currentPath}`);
		}
	}
}

function buildStickyNoteFileBaseName(now: Date): string {
	const datePart = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
	const timePart = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
	return `灵感-${datePart}-${timePart}-${buildRandomToken(4)}`;
}

function buildRandomToken(length: number): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let token = "";
	for (let index = 0; index < length; index += 1) {
		const nextIndex = Math.floor(Math.random() * chars.length);
		token += chars[nextIndex] ?? "X";
	}
	return token;
}

function pad2(value: number): string {
	return `${value}`.padStart(2, "0");
}

function buildDefaultStickyNoteFileContent(options?: CreateStickyNoteFileOptions): string {
	const data: StickyNoteFileData = {
		warning: STICKY_NOTE_WARNING_TEXT,
		ispinned: false,
		color: pickRandomStickyNoteColor(),
		tags: "",
		images: "",
		isimageexpanded: false,
		isfloating: options?.isFloating ?? false,
		floatx: Number.isFinite(options?.floatX) ? Math.round(options?.floatX ?? 0) : 0,
		floaty: Number.isFinite(options?.floatY) ? Math.round(options?.floatY ?? 0) : 0,
		floatw: Number.isFinite(options?.floatW) ? Math.round(options?.floatW ?? STICKY_NOTE_FLOAT_DEFAULT_WIDTH) : STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
		floath: Number.isFinite(options?.floatH) ? Math.round(options?.floatH ?? STICKY_NOTE_FLOAT_DEFAULT_HEIGHT) : STICKY_NOTE_FLOAT_DEFAULT_HEIGHT,
	};
	return `<!---cw-data\n${JSON.stringify(data, null, 2)}\n--->\n`;
}

function pickRandomStickyNoteColor(): string {
	const index = Math.floor(Math.random() * STICKY_NOTE_COLORS.length);
	return STICKY_NOTE_COLORS[index] ?? STICKY_NOTE_DEFAULT_COLOR;
}

function parseStickyNoteFile(source: string): ParseStickyNoteResult {
	const normalized = normalizeMarkdownLineEndings(source);
	const blockMatch = normalized.match(/^\uFEFF?\s*<!---(cw-data|cna-data)\s*([\s\S]*?)\s*--->/i);
	if (!blockMatch) {
		return {
			data: {},
			contentMarkdown: normalized,
		};
	}
	const jsonSource = blockMatch[2]?.trim() ?? "";
	const data = parseStickyNoteData(jsonSource);
	let contentStart = blockMatch[0].length;
	if (normalized.slice(contentStart, contentStart + 2) === "\n\n") {
		contentStart += 2;
	} else if (normalized.slice(contentStart, contentStart + 1) === "\n") {
		contentStart += 1;
	}
	return {
		data,
		contentMarkdown: normalized.slice(contentStart),
	};
}

function parseStickyNoteData(source: string): StickyNoteFileData {
	if (!source) {
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(source);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function serializeStickyNoteFile(card: StickyNoteCardModel, novelLibraryService: NovelLibraryService): string {
	const normalizedImagePaths = Array.from(
		new Set(
			card.images
				.map((image) => novelLibraryService.normalizeVaultPath(image.vaultPath ?? ""))
				.filter((path) => path.length > 0),
		),
	);
	const preserved = isRecord(card.cwData) ? { ...card.cwData } : {};
	const data: StickyNoteFileData = {
		...preserved,
		warning: STICKY_NOTE_WARNING_TEXT,
		ispinned: card.isPinned,
		color: card.colorHex ?? "",
		tags: serializeTags(card.tagsText),
		images: normalizedImagePaths.join(","),
		isimageexpanded: card.isImageExpanded,
		isfloating: card.isFloating,
		floatx: Math.round(card.floatX),
		floaty: Math.round(card.floatY),
		floatw: Math.round(card.floatW),
		floath: Math.round(card.floatH),
	};
	const header = `<!---cw-data\n${JSON.stringify(data, null, 2)}\n--->`;
	const body = normalizeMarkdownLineEndings(card.contentMarkdown);
	return body.length > 0 ? `${header}\n\n${body}` : `${header}\n`;
}

function parseTagsToText(tagsValue: unknown): string {
	if (typeof tagsValue !== "string") {
		return "";
	}
	return parseCsvPaths(tagsValue, normalizeTagToken).join(" ");
}

function serializeTags(tagsText: string): string {
	const tags = tagsText.match(/#[^\s#]+/g) ?? [];
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const tag of tags) {
		const normalized = tag.trim();
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		unique.push(normalized);
	}
	return unique.join(",");
}

function normalizeTagToken(value: string): string {
	const compact = value.trim().replace(/\s+/g, "");
	if (!compact) {
		return "";
	}
	const normalized = compact.replace(/^#+/, "");
	return normalized.length > 0 ? `#${normalized}` : "";
}

function parseCsvPaths(value: unknown, normalizeItem: (value: string) => string): string[] {
	if (typeof value !== "string") {
		return [];
	}
	const parts = value
		.split(",")
		.map((item) => normalizeItem(item))
		.filter((item) => item.length > 0);
	return Array.from(new Set(parts));
}

function parseColorHex(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim();
	if (!normalized) {
		return undefined;
	}
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
