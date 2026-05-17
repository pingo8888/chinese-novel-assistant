import { App, TFile, TFolder } from "obsidian";
import { normalizeVaultPath } from "./novel-library-service";

export function listVaultFilesInFolder(app: App, folderPath: string): TFile[] {
	const normalizedFolderPath = normalizeVaultPath(folderPath);
	const root = app.vault.getAbstractFileByPath(normalizedFolderPath);
	if (!(root instanceof TFolder)) {
		return [];
	}

	const files: TFile[] = [];
	collectFiles(root, files);
	return files;
}

export function listVaultFilesInFolders(app: App, folderPaths: readonly string[]): TFile[] {
	const filesByPath = new Map<string, TFile>();
	for (const folderPath of folderPaths) {
		for (const file of listVaultFilesInFolder(app, folderPath)) {
			filesByPath.set(file.path, file);
		}
	}
	return Array.from(filesByPath.values());
}

export function listMarkdownFilesInFolder(app: App, folderPath: string): TFile[] {
	return listVaultFilesInFolder(app, folderPath).filter(isMarkdownFile);
}

export function listMarkdownFilesInFolders(app: App, folderPaths: readonly string[]): TFile[] {
	return listVaultFilesInFolders(app, folderPaths).filter(isMarkdownFile);
}

function collectFiles(folder: TFolder, files: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFile) {
			files.push(child);
			continue;
		}
		if (child instanceof TFolder) {
			collectFiles(child, files);
		}
	}
}

function isMarkdownFile(file: TFile): boolean {
	return file.extension.toLowerCase() === "md";
}
