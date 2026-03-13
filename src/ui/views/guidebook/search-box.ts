import type {
	GuidebookTreeData,
	GuidebookTreeFileNode,
	GuidebookTreeH1Node,
} from "../../../features/guidebook/tree-builder";

export interface GuidebookTreeSearchResult {
	treeData: GuidebookTreeData | null;
	matchedH2Count: number;
}

export function filterGuidebookTreeByKeyword(
	treeData: GuidebookTreeData | null,
	keyword: string,
): GuidebookTreeSearchResult {
	if (!treeData) {
		return {
			treeData: null,
			matchedH2Count: 0,
		};
	}

	const normalizedKeyword = keyword.trim().toLowerCase();
	if (!normalizedKeyword) {
		return {
			treeData,
			matchedH2Count: countAllH2(treeData),
		};
	}

	const filteredFiles: GuidebookTreeFileNode[] = [];
	let matchedH2Count = 0;
	for (const fileNode of treeData.files) {
		const filteredH1List: GuidebookTreeH1Node[] = [];
		for (const h1Node of fileNode.h1List) {
			if (matchesKeyword(h1Node.title, normalizedKeyword)) {
				filteredH1List.push(h1Node);
				matchedH2Count += h1Node.h2List.length;
				continue;
			}

			const matchedH2List = h1Node.h2List.filter((h2Node) => matchesKeyword(h2Node.title, normalizedKeyword));
			if (matchedH2List.length === 0) {
				continue;
			}
			matchedH2Count += matchedH2List.length;
			filteredH1List.push({
				...h1Node,
				h2List: matchedH2List,
			});
		}
		if (filteredH1List.length === 0) {
			continue;
		}
		filteredFiles.push({
			...fileNode,
			h1List: filteredH1List,
			h2Count: filteredH1List.reduce((total, h1Node) => total + h1Node.h2List.length, 0),
		});
	}

	return {
		treeData: {
			...treeData,
			files: filteredFiles,
		},
		matchedH2Count,
	};
}

function countAllH2(treeData: GuidebookTreeData): number {
	return treeData.files.reduce((total, fileNode) => total + fileNode.h2Count, 0);
}

function matchesKeyword(value: string, normalizedKeyword: string): boolean {
	return value.trim().toLowerCase().includes(normalizedKeyword);
}
