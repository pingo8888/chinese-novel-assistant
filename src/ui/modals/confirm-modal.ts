import { App, Modal, Setting } from "obsidian";

export interface ConfirmModalOptions {
	title: string;
	message: string;
	confirmText: string;
	cancelText: string;
	confirmIsDanger?: boolean;
}

export class ConfirmModal extends Modal {
	private readonly options: ConfirmModalOptions;
	private readonly onResult: (confirmed: boolean) => void;
	private resolved = false;

	constructor(app: App, options: ConfirmModalOptions, onResult: (confirmed: boolean) => void) {
		super(app);
		this.options = options;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.options.title);

		contentEl.createEl("p", {
			text: this.options.message,
		});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.options.cancelText).onClick(() => {
					this.finish(false);
				}),
			)
			.addButton((button) => {
				button.setButtonText(this.options.confirmText);
				if (this.options.confirmIsDanger) {
					button.buttonEl.addClass("cna-danger-button");
				}
				button.onClick(() => {
					this.finish(true);
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.onResult(false);
			this.resolved = true;
		}
	}

	private finish(confirmed: boolean): void {
		if (!this.resolved) {
			this.onResult(confirmed);
			this.resolved = true;
		}
		this.close();
	}
}

export function askForConfirmation(app: App, options: ConfirmModalOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal(app, options, resolve);
		modal.open();
	});
}
