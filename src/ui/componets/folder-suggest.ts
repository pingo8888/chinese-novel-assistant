import { type AbstractInputSuggest, type App, TFolder } from "obsidian";
import { attachInputSuggest } from "./input-suggest";

export function attachFolderSuggest(app: App, inputEl: HTMLInputElement): AbstractInputSuggest<TFolder> {
	return attachInputSuggest<TFolder>({
		app,
		inputEl,
		limit: 100,
		minSuggestionsToShow: 2,
		getSuggestions: (query) => {
			const normalized = query.trim().toLowerCase();
			const folders = app.vault
				.getAllLoadedFiles()
				.filter((file): file is TFolder => file instanceof TFolder && file.path.length > 0);

			if (!normalized) {
				return folders.slice(0, 100);
			}

			return folders.filter((folder) => folder.path.toLowerCase().includes(normalized)).slice(0, 100);
		},
		renderSuggestion: (folder, el) => {
			el.setText(folder.path);
		},
		getSuggestionValue: (folder) => folder.path,
	});
}
