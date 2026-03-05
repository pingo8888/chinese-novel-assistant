import type { App, TAbstractFile, Plugin } from "obsidian";

export type VaultChangeType = "create" | "modify" | "delete" | "rename";

export interface VaultChangeEvent {
	type: VaultChangeType;
	file: TAbstractFile;
	path: string;
	oldPath?: string;
}

export function bindVaultChangeWatcher(
	plugin: Plugin,
	app: App,
	onChange: (event: VaultChangeEvent) => void,
): void {
	plugin.registerEvent(
		app.vault.on("create", (file) => {
			onChange({
				type: "create",
				file,
				path: file.path,
			});
		}),
	);

	plugin.registerEvent(
		app.vault.on("modify", (file) => {
			onChange({
				type: "modify",
				file,
				path: file.path,
			});
		}),
	);

	plugin.registerEvent(
		app.vault.on("delete", (file) => {
			onChange({
				type: "delete",
				file,
				path: file.path,
			});
		}),
	);

	plugin.registerEvent(
		app.vault.on("rename", (file, oldPath) => {
			onChange({
				type: "rename",
				file,
				path: file.path,
				oldPath,
			});
		}),
	);
}
