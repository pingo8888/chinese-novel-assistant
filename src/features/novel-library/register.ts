import { TFolder, type Plugin } from "obsidian";
import { type PluginContext, NovelLibraryService, bindVaultChangeWatcher } from "../../core";

export function registerNovelLibraryFeature(plugin: Plugin, ctx: PluginContext): void {
	const novelLibraryService = new NovelLibraryService(plugin.app);
	// 监听目录重命名，自动同步设置中的小说库路径。
	bindVaultChangeWatcher(plugin, plugin.app, (event) => {
		if (event.type !== "rename") {
			return;
		}
		if (!(event.file instanceof TFolder)) {
			return;
		}
		const previousPath = novelLibraryService.normalizeVaultPath(event.oldPath ?? "");
		const nextPath = novelLibraryService.normalizeVaultPath(event.path);
		if (!previousPath || !nextPath || previousPath === nextPath) {
			return;
		}

		// 将受影响的库路径按新目录位置重映射。
		const nextLibraries = remapNovelLibraryPaths(ctx.settings.novelLibraries, previousPath, nextPath, novelLibraryService);
		if (nextLibraries === null) {
			return;
		}

		void ctx.setSettings({
			novelLibraries: nextLibraries,
		});
	});
}

function remapNovelLibraryPaths(
	libraryPaths: string[],
	previousRootPath: string,
	nextRootPath: string,
	novelLibraryService: NovelLibraryService,
): string[] | null {
	let changed = false;
	// 仅重写“旧根目录及其子路径”对应的条目，其他路径保持不变。
	const mapped = libraryPaths.map((path) => {
		const normalizedPath = novelLibraryService.normalizeVaultPath(path);
		if (!normalizedPath || !novelLibraryService.isSameOrChildPath(normalizedPath, previousRootPath)) {
			return path;
		}
		changed = true;
		const suffix = normalizedPath === previousRootPath ? "" : normalizedPath.slice(previousRootPath.length);
		return `${nextRootPath}${suffix}`;
	});

	if (!changed) {
		return null;
	}
	return dedupeLibraryPaths(mapped, novelLibraryService);
}

function dedupeLibraryPaths(paths: string[], novelLibraryService: NovelLibraryService): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	// 归一化后按不区分大小写去重，防止同一路径重复写入设置。
	for (const path of paths) {
		const normalized = novelLibraryService.normalizeVaultPath(path);
		if (!normalized) {
			continue;
		}
		const dedupeKey = normalized.toLowerCase();
		if (seen.has(dedupeKey)) {
			continue;
		}
		seen.add(dedupeKey);
		result.push(normalized);
	}
	return result;
}


