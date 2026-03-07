import { TFolder, type Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { NovelLibraryService } from "../../services/novel-library-service";
import { bindVaultChangeWatcher } from "../../services/vault-change-watcher";

export function registerNovelLibraryFeature(plugin: Plugin, ctx: PluginContext): void {
	const novelLibraryService = new NovelLibraryService(plugin.app);
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
