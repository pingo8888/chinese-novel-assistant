import type { App, TFile } from "obsidian";
import { NovelLibraryService } from "../../services/novel-library-service";
import type { ChineseNovelAssistantSettings } from "../../settings/settings";

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
		const h1List = parseGuidebookMarkdown(markdown, file.path, file.stat.ctime);

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

function parseGuidebookMarkdown(content: string, sourcePath: string, sourceFileCtime: number): GuidebookTreeH1Node[] {
	const h1List: GuidebookTreeH1Node[] = [];
	const lines = content.split(/\r?\n/);
	let currentH1: GuidebookTreeH1Node | null = null;
	let currentH2: GuidebookTreeH2Node | null = null;
	let currentH2ContentLines: string[] = [];
	let codeFence: { marker: "`" | "~"; length: number } | null = null;
	let currentH1Index = -1;
	let currentH2Index = -1;

	const finalizeCurrentH2 = (): void => {
		if (!currentH2) {
			currentH2ContentLines = [];
			return;
		}
		currentH2.content = currentH2ContentLines.join("\n").trimEnd();
		currentH2 = null;
		currentH2ContentLines = [];
	};

	for (const line of lines) {
		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
		if (codeFence) {
			if (currentH2) {
				currentH2ContentLines.push(line);
			}
			if (fenceMatch && fenceMatch[1] && fenceMatch[1][0] === codeFence.marker && fenceMatch[1].length >= codeFence.length) {
				codeFence = null;
			}
			continue;
		}

		if (fenceMatch && fenceMatch[1]) {
			if (currentH2) {
				currentH2ContentLines.push(line);
			}
			codeFence = {
				marker: fenceMatch[1][0] as "`" | "~",
				length: fenceMatch[1].length,
			};
			continue;
		}

		const heading = parseAtxHeading(line);
		if (!heading) {
			if (currentH2) {
				currentH2ContentLines.push(line);
			}
			continue;
		}

		if (heading.level === 1) {
			finalizeCurrentH2();
			currentH1Index += 1;
			currentH2Index = -1;
			currentH1 = {
				title: heading.title,
				h2List: [],
				sourcePath,
				sourceFileCtime,
				h1IndexInSource: currentH1Index,
			};
			h1List.push(currentH1);
			continue;
		}

		if (heading.level === 2) {
			finalizeCurrentH2();
			if (!currentH1) {
				continue;
			}
			currentH2Index += 1;
			currentH2 = {
				title: heading.title,
				content: "",
				sourcePath,
				sourceFileCtime,
				h1IndexInSource: currentH1.h1IndexInSource,
				h2IndexInH1: currentH2Index,
			};
			currentH1.h2List.push(currentH2);
			continue;
		}

		if (heading.level >= 3) {
			finalizeCurrentH2();
			continue;
		}
	}

	finalizeCurrentH2();
	return h1List;
}

function parseAtxHeading(line: string): { level: number; title: string } | null {
	const match = line.match(/^\s{0,3}(#{1,6})[ \t]+(.*)$/);
	if (!match || !match[1]) {
		return null;
	}

	let title = (match[2] ?? "").trim();
	title = title.replace(/[ \t]+#+[ \t]*$/, "").trim();
	if (!title) {
		return null;
	}

	return {
		level: match[1].length,
		title,
	};
}
