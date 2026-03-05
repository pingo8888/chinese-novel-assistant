import { App, Modal, Setting } from "obsidian";

export interface TextInputModalOptions {
	title: string;
	placeholder?: string;
	initialValue?: string;
	confirmText: string;
	cancelText: string;
	normalize?: (value: string) => string;
	validate?: (value: string) => string | null;
}

export class TextInputModal extends Modal {
	private readonly options: TextInputModalOptions;
	private readonly onResult: (value: string | null) => void;
	private resolved = false;
	private rawValue: string;
	private errorEl: HTMLElement | null = null;
	private confirmButtonEl: HTMLButtonElement | null = null;
	private inputEl: HTMLInputElement | null = null;

	constructor(app: App, options: TextInputModalOptions, onResult: (value: string | null) => void) {
		super(app);
		this.options = options;
		this.onResult = onResult;
		this.rawValue = options.initialValue ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.options.title);

		new Setting(contentEl).addText((text) => {
			text
				.setPlaceholder(this.options.placeholder ?? "")
				.setValue(this.rawValue)
				.onChange((value) => {
					this.rawValue = value;
					this.syncValidationState();
				});
			this.inputEl = text.inputEl;
			this.inputEl.addEventListener("keydown", (event) => {
				if (event.key !== "Enter") {
					return;
				}
				event.preventDefault();
				this.tryConfirm();
			});
		});

		this.errorEl = contentEl.createDiv({ cls: "setting-item-description" });
		this.errorEl.style.minHeight = "1.2em";

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.options.cancelText).onClick(() => {
					this.finish(null);
				}),
			)
			.addButton((button) => {
				button.setButtonText(this.options.confirmText);
				this.confirmButtonEl = button.buttonEl;
				button.onClick(() => {
					this.tryConfirm();
				});
			});

		this.syncValidationState();

		window.setTimeout(() => {
			this.inputEl?.focus();
			this.inputEl?.select();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.onResult(null);
			this.resolved = true;
		}
	}

	private resolveValue(): string {
		const normalize = this.options.normalize ?? ((value: string) => value);
		return normalize(this.rawValue);
	}

	private resolveValidationError(value: string): string | null {
		return this.options.validate?.(value) ?? null;
	}

	private syncValidationState(): void {
		const value = this.resolveValue();
		const validationError = this.resolveValidationError(value);
		if (this.errorEl) {
			this.errorEl.setText(validationError ?? "");
		}
		if (this.confirmButtonEl) {
			this.confirmButtonEl.disabled = Boolean(validationError);
		}
	}

	private tryConfirm(): void {
		const value = this.resolveValue();
		const validationError = this.resolveValidationError(value);
		if (validationError) {
			this.syncValidationState();
			return;
		}
		this.finish(value);
	}

	private finish(value: string | null): void {
		if (!this.resolved) {
			this.onResult(value);
			this.resolved = true;
		}
		this.close();
	}
}

export function promptTextInput(app: App, options: TextInputModalOptions): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new TextInputModal(app, options, resolve);
		modal.open();
	});
}
