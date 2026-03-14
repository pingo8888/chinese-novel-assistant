export interface ClearableInputComponentOptions {
	containerEl: HTMLElement;
	placeholder: string;
	initialValue?: string;
	containerClassName?: string;
	onChange: (value: string) => void;
}

export class ClearableInputComponent {
	private readonly rootEl: HTMLElement;
	private readonly inputEl: HTMLInputElement;
	private readonly clearButtonEl: HTMLElement;
	private readonly onChange: (value: string) => void;
	private isComposing = false;

	constructor(options: ClearableInputComponentOptions) {
		// Reuse Obsidian's built-in search input classes for icon and clear-button visuals.
		const className = options.containerClassName
			? `search-input-container ${options.containerClassName}`
			: "search-input-container";
		this.rootEl = options.containerEl.createDiv({ cls: className });
		this.inputEl = this.rootEl.createEl("input", {
			type: "search",
			attr: {
				placeholder: options.placeholder,
			},
		});
		this.clearButtonEl = this.rootEl.createDiv({
			cls: "search-input-clear-button",
		});
		this.onChange = options.onChange;

		this.inputEl.value = options.initialValue ?? "";
		this.syncClearButton();
		this.bindEvents();
	}

	setValue(value: string, emitChange = false): void {
		this.inputEl.value = value;
		this.syncClearButton();
		if (emitChange) {
			this.onChange(value);
		}
	}

	getValue(): string {
		return this.inputEl.value;
	}

	focus(): void {
		this.inputEl.focus();
	}

	private bindEvents(): void {
		this.inputEl.addEventListener("compositionstart", () => {
			this.isComposing = true;
		});
		this.inputEl.addEventListener("compositionend", () => {
			this.isComposing = false;
			this.emitChange();
		});
		this.inputEl.addEventListener("input", () => {
			if (this.isComposing) {
				return;
			}
			this.emitChange();
		});
		this.clearButtonEl.addEventListener("click", () => {
			if (this.inputEl.value.length === 0) {
				return;
			}
			this.inputEl.value = "";
			this.emitChange();
			this.focus();
		});
	}

	private emitChange(): void {
		this.syncClearButton();
		this.onChange(this.inputEl.value);
	}

	private syncClearButton(): void {
		this.clearButtonEl.toggleClass("is-visible", this.inputEl.value.length > 0);
	}
}
