import { TFile, type App } from "obsidian";
import { type SettingDatas, NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES, STICKY_NOTE_COLORS } from "../../core";

import type { StickyNoteCard, StickyNoteImage } from "./views/types";
import { asBoolean, asNumber, buildRandomToken, extractPlainTextFromMarkdown, isRecord, pad2, parseColorHex } from "../../utils";

import {
	STICKY_NOTE_FLOAT_DEFAULT_HEIGHT,
	STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
} from "./index";

const STICKY_NOTE_WARNING_TEXT = "数据由灵感便签管理，请勿删除或手动修改";
const STICKY_NOTE_DEFAULT_COLOR = "#9CA3AF";

type StickyNoteMetadata = Record<string, unknown>;

// 单便签文件的解析结果
interface ParseStickyNoteResult {
	metadata: StickyNoteMetadata;		// 便签元数据
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

	async listCards(settings: SettingDatas, rootPaths?: string[]): Promise<StickyNoteCard[]> {
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
		return cards.filter((card): card is StickyNoteCard => card !== null);
	}

	async getCardByPath(path: string): Promise<StickyNoteCard | null> {
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
		await this.novelLibraryService.ensureFolderPath(normalizedRootPath);
		for (let attempt = 0; attempt < 60; attempt += 1) {
			// 便签文件名构建
			const now = new Date();
			const datePart = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
			const timePart = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
			const fileBaseName = `灵感-${datePart}-${timePart}-${buildRandomToken(4)}`;
			const filePath = `${normalizedRootPath}/${fileBaseName}.md`;
			if (this.app.vault.getAbstractFileByPath(filePath)) {
				continue;
			}
			return this.app.vault.create(filePath, buildStickyNoteMetadata(options));
		}
		throw new Error("Failed to create unique sticky note file name.");
	}

	async saveCard(card: StickyNoteCard): Promise<void> {
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

	async deleteCard(card: StickyNoteCard): Promise<void> {
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
				this.novelLibraryService.resolveNovelLibrarySubdirPath(libraryPath,
					NOVEL_LIBRARY_SUBDIR_NAMES.stickyNote,
				),
			)
			.map((path) => this.novelLibraryService.normalizeVaultPath(path))
			.filter((path) => path.length > 0);
		return Array.from(new Set(roots));
	}

	// 便签md数据解析
	private async readCardFromFile(file: TFile): Promise<StickyNoteCard | null> {
		try {
			const raw = await this.app.vault.cachedRead(file);
			const parsed = parseStickyNoteFile(raw);
			const imagePaths = parseCsvPaths(parsed.metadata["images"], (value) => this.novelLibraryService.normalizeVaultPath(value));
			const images = this.resolveImageModels(file.path, imagePaths);
			const contentMarkdown = parsed.contentMarkdown.replace(/\r\n?/g, "\n");
			return {
				id: file.path,
				sourcePath: file.path,
				cwData: { ...parsed.metadata },
				createdAt: file.stat.ctime,
				updatedAt: file.stat.mtime,
				contentMarkdown,
				contentPlainText: extractPlainTextFromMarkdown(contentMarkdown),
				tagsText: parseTagsToText(parsed.metadata["tags"]),
				images,
				isImageExpanded: asBoolean(parsed.metadata["isimageexpanded"], false),
				isPinned: asBoolean(parsed.metadata["ispinned"], false),
				colorHex: parseColorHex(parsed.metadata["color"]),
				isFloating: asBoolean(parsed.metadata["isfloating"], false),
				floatX: asNumber(parsed.metadata["floatx"], 0),
				floatY: asNumber(parsed.metadata["floaty"], 0),
				floatW: asNumber(parsed.metadata["floatw"], STICKY_NOTE_FLOAT_DEFAULT_WIDTH),
				floatH: asNumber(parsed.metadata["floath"], STICKY_NOTE_FLOAT_DEFAULT_HEIGHT),
			};
		} catch {
			return null;
		}
	}

	// 便签图片解析（从路径到图片对象）
	private resolveImageModels(notePath: string, imagePaths: string[]): StickyNoteImage[] {
		const models: StickyNoteImage[] = [];
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
				revokeOnDestroy: false,
				vaultPath: normalizedPath,
			});
		}
		return models;
	}

}
// 便签元数据构建
function buildStickyNoteMetadata(options?: CreateStickyNoteFileOptions): string {
	// 随机便签颜色
	const colorIndex = Math.floor(Math.random() * STICKY_NOTE_COLORS.length);
	const color = STICKY_NOTE_COLORS[colorIndex] ?? STICKY_NOTE_DEFAULT_COLOR;
	const metadata: StickyNoteMetadata = {
		warning: STICKY_NOTE_WARNING_TEXT,
		ispinned: false,
		color,
		tags: "",
		images: "",
		isimageexpanded: false,
		isfloating: options?.isFloating ?? false,
		floatx: Number.isFinite(options?.floatX) ? Math.round(options?.floatX ?? 0) : 0,
		floaty: Number.isFinite(options?.floatY) ? Math.round(options?.floatY ?? 0) : 0,
		floatw: Number.isFinite(options?.floatW) ? Math.round(options?.floatW ?? STICKY_NOTE_FLOAT_DEFAULT_WIDTH) : STICKY_NOTE_FLOAT_DEFAULT_WIDTH,
		floath: Number.isFinite(options?.floatH) ? Math.round(options?.floatH ?? STICKY_NOTE_FLOAT_DEFAULT_HEIGHT) : STICKY_NOTE_FLOAT_DEFAULT_HEIGHT,
	};
	return `<!---cw-data\n${JSON.stringify(metadata, null, 2)}\n--->\n`;
}

// 便签md数据解析
function parseStickyNoteFile(source: string): ParseStickyNoteResult {
	const normalized = source.replace(/\r\n?/g, "\n");
	const blockMatch = normalized.match(/^\uFEFF?\s*<!---(cw-data|cna-data)\s*([\s\S]*?)\s*--->/i);
	if (!blockMatch) {
		return {
			metadata: {},
			contentMarkdown: normalized,
		};
	}
	const jsonSource = blockMatch[2]?.trim() ?? "";
	let metadata: StickyNoteMetadata = {};
	if (jsonSource) {
		try {
			const parsed: unknown = JSON.parse(jsonSource);
			metadata = isRecord(parsed) ? parsed : {};
		} catch {
			metadata = {};
		}
	}
	let contentStart = blockMatch[0].length;
	if (normalized.slice(contentStart, contentStart + 2) === "\n\n") {
		contentStart += 2;
	} else if (normalized.slice(contentStart, contentStart + 1) === "\n") {
		contentStart += 1;
	}
	return {
		metadata,
		contentMarkdown: normalized.slice(contentStart),
	};
}

// 便签md数据序列化
function serializeStickyNoteFile(card: StickyNoteCard, novelLibraryService: NovelLibraryService): string {
	const normalizedImagePaths = Array.from(
		new Set(
			card.images
				.map((image) => novelLibraryService.normalizeVaultPath(image.vaultPath ?? ""))
				.filter((path) => path.length > 0),
		),
	);
	const preserved = isRecord(card.cwData) ? { ...card.cwData } : {};
	const metadata: StickyNoteMetadata = {
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
	const header = `<!---cw-data\n${JSON.stringify(metadata, null, 2)}\n--->`;
	const body = card.contentMarkdown.replace(/\r\n?/g, "\n");
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

// 便签标签解析
function normalizeTagToken(value: string): string {
	const compact = value.trim().replace(/\s+/g, "");
	if (!compact) {
		return "";
	}
	const normalized = compact.replace(/^#+/, "");
	return normalized.length > 0 ? `#${normalized}` : "";
}

// 便签图片路径解析
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





