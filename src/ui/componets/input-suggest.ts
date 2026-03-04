import { AbstractInputSuggest, type App } from "obsidian";

export interface InputSuggestOptions<T> {
	app: App;
	inputEl: HTMLInputElement;
	getSuggestions: (query: string) => T[] | Promise<T[]>;
	renderSuggestion: (item: T, el: HTMLElement) => void;
	getSuggestionValue?: (item: T) => string;
	onSelectSuggestion?: (item: T, evt: MouseEvent | KeyboardEvent) => void;
	limit?: number;
	minSuggestionsToShow?: number;
}

class InputSuggestController<T> extends AbstractInputSuggest<T> {
	private readonly source: InputSuggestOptions<T>;
	private readonly textInputEl: HTMLInputElement;

	constructor(source: InputSuggestOptions<T>) {
		super(source.app, source.inputEl);
		this.source = source;
		this.textInputEl = source.inputEl;
		if (typeof source.limit === "number") {
			this.limit = source.limit;
		}
	}

	protected getSuggestions(query: string): T[] | Promise<T[]> {
		return Promise.resolve(this.source.getSuggestions(query)).then((suggestions) => {
			const minSuggestionsToShow = this.source.minSuggestionsToShow ?? 1;
			return suggestions.length >= minSuggestionsToShow ? suggestions : [];
		});
	}

	renderSuggestion(value: T, el: HTMLElement): void {
		this.source.renderSuggestion(value, el);
	}

	selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
		const nextValue = this.source.getSuggestionValue?.(value);
		if (typeof nextValue === "string") {
			this.textInputEl.value = nextValue;
			this.textInputEl.dispatchEvent(new Event("input"));
		}
		this.source.onSelectSuggestion?.(value, evt);
	}
}

export function attachInputSuggest<T>(options: InputSuggestOptions<T>): AbstractInputSuggest<T> {
	return new InputSuggestController(options);
}
