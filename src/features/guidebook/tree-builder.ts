import type { App, TFile } from "obsidian";
import { NovelLibraryService } from "../../services/novel-library-service";
import type { ChineseNovelAssistantSettings } from "../../settings/settings";
import { GuidebookMarkdownParser } from "./markdown-parser";

export interface GuidebookTreeH2Node {
	title: string;
	content: string;
	sourcePath: string;
	sourceFileCtime: number;
	h1IndexInSource: number;
	h2IndexInH1: number;
}

export interface GuidebookTreeH1Node {
	title: string;
	h2List: GuidebookTreeH2Node[];
	sourcePath: string;
	sourceFileCtime: number;
	h1IndexInSource: number;
}

export interface GuidebookTreeFileNode {
	fileName: string;
	stableKey: string;
	sourcePaths: string[];
	h1List: GuidebookTreeH1Node[];
	h2Count: number;
}

export interface GuidebookTreeData {
	libraryRootPath: string;
	guidebookRootPath: string;
	files: GuidebookTreeFileNode[];
}

type GuidebookTreeBuildSettings = Pick<ChineseNovelAssistantSettings, "locale" | "novelLibraries" | "guidebookDirName">;

interface GuidebookTreeFileBucket extends GuidebookTreeFileNode {
	firstFileCtime: number;
}

const guidebookMarkdownParser = new GuidebookMarkdownParser();

export async function buildGuidebookTreeData(
	app: App,
	settings: GuidebookTreeBuildSettings,
	activeFilePath: string | null,
): Promise<GuidebookTreeData | null> {
	const libraryService = new NovelLibraryService(app);
	const normalizedLibraryRoots = libraryService.normalizeLibraryRoots(settings.novelLibraries);
	const containingLibraryRoot = activeFilePath
		? libraryService.resolveContainingLibraryRoot(activeFilePath, normalizedLibraryRoots)
		: null;
	if (!containingLibraryRoot) {
		return null;
	}

	const guidebookRootPath = libraryService.resolveNovelLibrarySubdirPath(
		{ locale: settings.locale },
		containingLibraryRoot,
		settings.guidebookDirName,
	);
	if (!guidebookRootPath) {
		return {
			libraryRootPath: containingLibraryRoot,
			guidebookRootPath: "",
			files: [],
		};
	}

	const guidebookMarkdownFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => libraryService.isSameOrChildPath(file.path, guidebookRootPath))
		.sort(compareByFileCreationTime);

	const fileBucketByName = new Map<string, GuidebookTreeFileBucket>();
	for (const file of guidebookMarkdownFiles) {
		const markdown = await app.vault.cachedRead(file);
		const h1List = mapParsedGuidebookTree(markdown, file.path, file.stat.ctime);

		const fileNameKey = file.basename;
		let fileBucket = fileBucketByName.get(fileNameKey);
		if (!fileBucket) {
			fileBucket = {
				fileName: file.basename,
				stableKey: String(file.stat.ctime),
				sourcePaths: [],
				h1List: [],
				h2Count: 0,
				firstFileCtime: file.stat.ctime,
			};
			fileBucketByName.set(fileNameKey, fileBucket);
		}
		const targetBucket = fileBucket;

		targetBucket.sourcePaths.push(file.path);
		targetBucket.h1List.push(...h1List);
		targetBucket.h2Count += h1List.reduce((total, h1Node) => total + h1Node.h2List.length, 0);
		if (file.stat.ctime < targetBucket.firstFileCtime) {
			targetBucket.firstFileCtime = file.stat.ctime;
			targetBucket.stableKey = String(file.stat.ctime);
		}
	}

	const files = Array.from(fileBucketByName.values())
		.sort((left, right) => left.firstFileCtime - right.firstFileCtime || left.fileName.localeCompare(right.fileName))
		.map((bucket) => ({
			fileName: bucket.fileName,
			stableKey: String(bucket.firstFileCtime),
			sourcePaths: bucket.sourcePaths,
			h1List: bucket.h1List,
			h2Count: bucket.h2Count,
		}));

	return {
		libraryRootPath: containingLibraryRoot,
		guidebookRootPath,
		files,
	};
}

function compareByFileCreationTime(left: TFile, right: TFile): number {
	const ctimeDiff = left.stat.ctime - right.stat.ctime;
	if (ctimeDiff !== 0) {
		return ctimeDiff;
	}
	return left.path.localeCompare(right.path);
}

function mapParsedGuidebookTree(content: string, sourcePath: string, sourceFileCtime: number): GuidebookTreeH1Node[] {
	return guidebookMarkdownParser.parseTree(content).map((h1Node) => ({
		title: h1Node.title,
		h2List: h1Node.h2List.map((h2Node): GuidebookTreeH2Node => ({
			title: h2Node.title,
			content: h2Node.content,
			sourcePath,
			sourceFileCtime,
			h1IndexInSource: h2Node.h1IndexInSource,
			h2IndexInH1: h2Node.h2IndexInH1,
		})),
		sourcePath,
		sourceFileCtime,
		h1IndexInSource: h1Node.h1IndexInSource,
	}));
}
