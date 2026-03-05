import { App, Modal } from "obsidian";

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
		this.modalEl.classList.add("cna-text-input-modal-shell");
		contentEl.classList.add("cna-text-input-modal");

		const bodyEl = contentEl.createDiv({ cls: "cna-text-input-modal__body" });
		const inputWrapEl = bodyEl.createDiv({ cls: "cna-text-input-modal__input-wrap" });
		this.inputEl = inputWrapEl.createEl("input", {
			type: "text",
			cls: "cna-text-input-modal__input",
		});
		this.inputEl.value = this.rawValue;
		this.inputEl.placeholder = this.options.placeholder ?? "";
		this.inputEl.addEventListener("input", () => {
			this.rawValue = this.inputEl?.value ?? "";
			this.syncValidationState();
		});
		this.inputEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") {
				return;
			}
			event.preventDefault();
			this.tryConfirm();
		});

		const footerEl = bodyEl.createDiv({ cls: "cna-text-input-modal__footer" });
		const cancelButtonEl = footerEl.createEl("button", { cls: "cna-text-input-modal__button" });
		cancelButtonEl.type = "button";
		cancelButtonEl.setText(this.options.cancelText);
		cancelButtonEl.addEventListener("click", () => {
			this.finish(null);
		});

		this.confirmButtonEl = footerEl.createEl("button", {
			cls: "mod-cta cna-text-input-modal__button",
		});
		this.confirmButtonEl.type = "button";
		this.confirmButtonEl.setText(this.options.confirmText);
		this.confirmButtonEl.addEventListener("click", () => {
			this.tryConfirm();
		});

		this.syncValidationState();

		window.setTimeout(() => {
			this.inputEl?.focus();
			this.inputEl?.select();
		}, 0);
	}

	onClose(): void {
		this.modalEl.classList.remove("cna-text-input-modal-shell");
		this.contentEl.classList.remove("cna-text-input-modal");
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
		if (this.inputEl) {
			this.inputEl.classList.toggle("is-invalid", Boolean(validationError));
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
