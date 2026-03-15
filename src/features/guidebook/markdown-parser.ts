import { splitLines } from "../../utils";

export interface GuidebookMarkdownTreeH2Node {
	title: string;
	content: string;
	h1IndexInSource: number;
	h2IndexInH1: number;
}

export interface GuidebookMarkdownTreeH1Node {
	title: string;
	h2List: GuidebookMarkdownTreeH2Node[];
	h1IndexInSource: number;
}

export interface GuidebookMarkdownSectionH2 {
	startLine: number;
	endLine: number;
}

export interface GuidebookMarkdownSectionH1 {
	startLine: number;
	endLine: number;
	h2Sections: GuidebookMarkdownSectionH2[];
}

export interface GuidebookMarkdownSections {
	h1Sections: GuidebookMarkdownSectionH1[];
}

export class GuidebookMarkdownParser {
	parseTree(content: string): GuidebookMarkdownTreeH1Node[] {
		const h1List: GuidebookMarkdownTreeH1Node[] = [];
		const lines = splitLines(content);
		let currentH1: GuidebookMarkdownTreeH1Node | null = null;
		let currentH2: GuidebookMarkdownTreeH2Node | null = null;
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

			const heading = this.parseAtxHeading(line);
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

	parseSections(content: string): GuidebookMarkdownSections {
		const lines = splitLines(content);
		const h1Sections: GuidebookMarkdownSectionH1[] = [];
		let currentH1: GuidebookMarkdownSectionH1 | null = null;
		let currentH2: GuidebookMarkdownSectionH2 | null = null;
		let codeFence: { marker: "`" | "~"; length: number } | null = null;

		const finalizeCurrentH2 = (endLine: number): void => {
			if (!currentH2) {
				return;
			}
			currentH2.endLine = endLine;
			currentH2 = null;
		};
		const finalizeCurrentH1 = (endLine: number): void => {
			if (!currentH1) {
				return;
			}
			currentH1.endLine = endLine;
			currentH1 = null;
		};

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
			const line = lines[lineIndex] ?? "";
			const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
			if (codeFence) {
				if (fenceMatch && fenceMatch[1] && fenceMatch[1][0] === codeFence.marker && fenceMatch[1].length >= codeFence.length) {
					codeFence = null;
				}
				continue;
			}
			if (fenceMatch && fenceMatch[1]) {
				codeFence = {
					marker: fenceMatch[1][0] as "`" | "~",
					length: fenceMatch[1].length,
				};
				continue;
			}

			const heading = this.parseAtxHeading(line);
			if (!heading) {
				continue;
			}
			if (heading.level === 1) {
				finalizeCurrentH2(lineIndex);
				finalizeCurrentH1(lineIndex);
				currentH1 = {
					startLine: lineIndex,
					endLine: lines.length,
					h2Sections: [],
				};
				h1Sections.push(currentH1);
				continue;
			}
			if (heading.level === 2) {
				finalizeCurrentH2(lineIndex);
				if (!currentH1) {
					continue;
				}
				currentH2 = {
					startLine: lineIndex,
					endLine: currentH1.endLine,
				};
				currentH1.h2Sections.push(currentH2);
			}
		}

		finalizeCurrentH2(lines.length);
		finalizeCurrentH1(lines.length);
		return { h1Sections };
	}

	private parseAtxHeading(line: string): { level: number; title: string } | null {
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
}

