import type { App, TAbstractFile, Plugin } from "obsidian";

export type VaultChangeType = "create" | "modify" | "delete" | "rename";

export interface VaultChangeEvent {
	type: VaultChangeType;
	file: TAbstractFile;
	path: string;
	oldPath?: string;
}

export function watchVaultChanges(
	app: App,
	onChange: (event: VaultChangeEvent) => void,
): () => void {
	const eventRefs = [
		app.vault.on("create", (file) => {
			onChange({
				type: "create",
				file,
				path: file.path,
			});
		}),
		app.vault.on("modify", (file) => {
			onChange({
				type: "modify",
				file,
				path: file.path,
			});
		}),
		app.vault.on("delete", (file) => {
			onChange({
				type: "delete",
				file,
				path: file.path,
			});
		}),
		app.vault.on("rename", (file, oldPath) => {
			onChange({
				type: "rename",
				file,
				path: file.path,
				oldPath,
			});
		}),
	];

	return () => {
		for (const eventRef of eventRefs) {
			app.vault.offref(eventRef);
		}
	};
}

export function bindVaultChangeWatcher(
	plugin: Plugin,
	app: App,
	onChange: (event: VaultChangeEvent) => void,
): void {
	plugin.register(watchVaultChanges(app, onChange));
}
