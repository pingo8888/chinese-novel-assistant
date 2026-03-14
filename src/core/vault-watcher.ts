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
	const emit = (type: VaultChangeType, file: TAbstractFile, oldPath?: string): void => {
		onChange({
			type,
			file,
			path: file.path,
			oldPath,
		});
	};

	const eventRefs = [
		app.vault.on("create", (file) => emit("create", file)),
		app.vault.on("modify", (file) => emit("modify", file)),
		app.vault.on("delete", (file) => emit("delete", file)),
		app.vault.on("rename", (file, oldPath) => emit("rename", file, oldPath)),
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
