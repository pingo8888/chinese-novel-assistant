import type { App, TFile } from "obsidian";
import { NovelLibraryService, NOVEL_LIBRARY_SUBDIR_NAMES } from "../../core/novel-library-service";
import type { SettingDatas } from "../../core/setting-datas";
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

type GuidebookTreeBuildSettings = Pick<
	SettingDatas,
	"locale" | "novelLibraries" | "guidebookCollectionOrders"
>;

interface GuidebookTreeFileBucket extends GuidebookTreeFileNode {
	firstFileCtime: number;
}

interface ParsedGuidebookFileCacheEntry {
	mtime: number;
	size: number;
	ctime: number;
	h1List: GuidebookTreeH1Node[];
}

interface GuidebookTreeCacheEntry {
	signature: string;
	orderedSourcePathsKey: string;
	data: GuidebookTreeData;
}

const guidebookMarkdownParser = new GuidebookMarkdownParser();
const parsedGuidebookFileCacheByPath = new Map<string, ParsedGuidebookFileCacheEntry>();
const guidebookTreeCacheByRootPath = new Map<string, GuidebookTreeCacheEntry>();

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
		NOVEL_LIBRARY_SUBDIR_NAMES.guidebook,
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
	const guidebookFileSignature = guidebookMarkdownFiles
		.map((file) => `${file.path}\u0000${file.stat.mtime}\u0000${file.stat.size}\u0000${file.stat.ctime}`)
		.join("\u0001");
	const orderedSourcePaths = settings.guidebookCollectionOrders[guidebookRootPath] ?? [];
	const orderedSourcePathsKey = orderedSourcePaths.join("\u0001");
	const cachedTree = guidebookTreeCacheByRootPath.get(guidebookRootPath);
	if (cachedTree && cachedTree.signature === guidebookFileSignature && cachedTree.orderedSourcePathsKey === orderedSourcePathsKey) {
		return cachedTree.data;
	}

	const fileBucketByName = new Map<string, GuidebookTreeFileBucket>();
	const activeGuidebookPaths = new Set<string>();
	for (const file of guidebookMarkdownFiles) {
		activeGuidebookPaths.add(file.path);
		const h1List = await resolveParsedGuidebookTreeByFile(app, file);

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
	pruneGuidebookFileParseCache(guidebookRootPath, activeGuidebookPaths);

	const collectionOrderMap = buildCollectionOrderMap(orderedSourcePaths);
	const files = Array.from(fileBucketByName.values())
		.sort((left, right) =>
			compareByCollectionOrder(
				left,
				right,
				collectionOrderMap,
			),
		)
		.map((bucket) => ({
			fileName: bucket.fileName,
			stableKey: String(bucket.firstFileCtime),
			sourcePaths: bucket.sourcePaths,
			h1List: bucket.h1List,
			h2Count: bucket.h2Count,
		}));

	const treeData: GuidebookTreeData = {
		libraryRootPath: containingLibraryRoot,
		guidebookRootPath,
		files,
	};
	guidebookTreeCacheByRootPath.set(guidebookRootPath, {
		signature: guidebookFileSignature,
		orderedSourcePathsKey,
		data: treeData,
	});
	return treeData;
}

function compareByFileCreationTime(left: TFile, right: TFile): number {
	const ctimeDiff = left.stat.ctime - right.stat.ctime;
	if (ctimeDiff !== 0) {
		return ctimeDiff;
	}
	return left.path.localeCompare(right.path);
}

function compareByCollectionOrder(
	left: GuidebookTreeFileBucket,
	right: GuidebookTreeFileBucket,
	orderMap: Map<string, number>,
): number {
	const leftPath = left.sourcePaths[0] ?? "";
	const rightPath = right.sourcePaths[0] ?? "";
	const leftRank = orderMap.has(leftPath) ? orderMap.get(leftPath) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
	const rightRank = orderMap.has(rightPath) ? orderMap.get(rightPath) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
	if (leftRank !== rightRank) {
		return leftRank - rightRank;
	}
	return left.firstFileCtime - right.firstFileCtime || left.fileName.localeCompare(right.fileName);
}

function buildCollectionOrderMap(orderedSourcePaths: string[]): Map<string, number> {
	const orderMap = new Map<string, number>();
	orderedSourcePaths.forEach((path, index) => {
		orderMap.set(path, index);
	});
	return orderMap;
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

async function resolveParsedGuidebookTreeByFile(app: App, file: TFile): Promise<GuidebookTreeH1Node[]> {
	const cached = parsedGuidebookFileCacheByPath.get(file.path);
	if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size && cached.ctime === file.stat.ctime) {
		return cached.h1List;
	}
	const markdown = await app.vault.cachedRead(file);
	const h1List = mapParsedGuidebookTree(markdown, file.path, file.stat.ctime);
	parsedGuidebookFileCacheByPath.set(file.path, {
		mtime: file.stat.mtime,
		size: file.stat.size,
		ctime: file.stat.ctime,
		h1List,
	});
	return h1List;
}

function pruneGuidebookFileParseCache(guidebookRootPath: string, activeGuidebookPaths: Set<string>): void {
	for (const path of parsedGuidebookFileCacheByPath.keys()) {
		if (!path.startsWith(`${guidebookRootPath}/`) && path !== guidebookRootPath) {
			continue;
		}
		if (!activeGuidebookPaths.has(path)) {
			parsedGuidebookFileCacheByPath.delete(path);
		}
	}
}


