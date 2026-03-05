import { App, TFile } from "obsidian";
import type { ChineseNovelAssistantSettings } from "../settings/settings";
import { NovelLibraryService } from "./novel-library-service";

export interface MarkdownParseRequest {
	settings: Pick<ChineseNovelAssistantSettings, "novelLibraries">;
	filePath: string;
	parserId?: string;
}

export interface MarkdownParserContext {
	app: App;
	file: TFile;
	filePath: string;
	normalizedFilePath: string;
	content: string;
}

export interface MarkdownParseResult<TParsed = unknown> {
	parserId: string;
	filePath: string;
	normalizedFilePath: string;
	parsed: TParsed;
}

export interface MarkdownParser<TParsed = unknown> {
	readonly id: string;
	parse(context: MarkdownParserContext): TParsed | Promise<TParsed>;
}

interface RegisterParserOptions {
	replace?: boolean;
}

interface DefaultRawParseResult {
	content: string;
}

export class MarkdownParseService {
	private static readonly DEFAULT_PARSER_ID = "raw";

	private app: App;
	private libraryService: NovelLibraryService;
	private parsers = new Map<string, MarkdownParser>();

	constructor(app: App) {
		this.app = app;
		this.libraryService = new NovelLibraryService(app);
		this.registerDefaultParsers();
	}

	listParserIds(): string[] {
		return Array.from(this.parsers.keys());
	}

	registerParser(parser: MarkdownParser, options: RegisterParserOptions = {}): void {
		const normalizedId = parser.id.trim();
		if (!normalizedId) {
			throw new Error("Parser id cannot be empty.");
		}

		const existed = this.parsers.has(normalizedId);
		if (existed && !options.replace) {
			throw new Error(`Parser already exists: ${normalizedId}`);
		}
		this.parsers.set(normalizedId, {
			...parser,
			id: normalizedId,
		});
	}

	unregisterParser(parserId: string): void {
		this.parsers.delete(parserId.trim());
	}

	async parseMarkdownFile<TParsed = unknown>(
		request: MarkdownParseRequest,
	): Promise<MarkdownParseResult<TParsed>> {
		const normalizedFilePath = this.libraryService.normalizeVaultPath(request.filePath);
		if (!normalizedFilePath) {
			throw new Error("File path cannot be empty.");
		}

		const normalizedLibraryRoots = request.settings.novelLibraries
			.map((path) => this.libraryService.normalizeVaultPath(path))
			.filter((path) => path.length > 0);
		if (!this.isPathInLibraries(normalizedFilePath, normalizedLibraryRoots)) {
			throw new Error(`File is not inside configured novel libraries: ${normalizedFilePath}`);
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedFilePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Markdown file does not exist: ${normalizedFilePath}`);
		}
		if (file.extension.toLowerCase() !== "md") {
			throw new Error(`Target file is not markdown: ${normalizedFilePath}`);
		}

		const parserId = request.parserId?.trim() || MarkdownParseService.DEFAULT_PARSER_ID;
		const parser = this.parsers.get(parserId);
		if (!parser) {
			throw new Error(`Unknown parser: ${parserId}`);
		}

		const content = await this.app.vault.cachedRead(file);
		const parsed = await parser.parse({
			app: this.app,
			file,
			filePath: file.path,
			normalizedFilePath,
			content,
		});

		return {
			parserId,
			filePath: file.path,
			normalizedFilePath,
			parsed: parsed as TParsed,
		};
	}

	private registerDefaultParsers(): void {
		this.registerParser({
			id: MarkdownParseService.DEFAULT_PARSER_ID,
			parse: ({ content }): DefaultRawParseResult => ({ content }),
		});
	}

	private isPathInLibraries(path: string, libraryRoots: string[]): boolean {
		return libraryRoots.some((root) => path === root || path.startsWith(`${root}/`));
	}
}
