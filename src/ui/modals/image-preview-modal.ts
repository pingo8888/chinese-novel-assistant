import { App, Modal } from "obsidian";

interface ImagePreviewModalDeps {
	src: string;
	name: string;
}

class ImagePreviewModal extends Modal {
	private readonly deps: ImagePreviewModalDeps;

	constructor(app: App, deps: ImagePreviewModalDeps) {
		super(app);
		this.deps = deps;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("cna-image-preview-modal-shell");
		contentEl.addClass("cna-image-preview-modal");

		const imageEl = contentEl.createEl("img", {
			cls: "cna-image-preview-modal__image",
			attr: {
				src: this.deps.src,
				alt: this.deps.name,
			},
		});
		imageEl.draggable = false;
	}

	onClose(): void {
		this.modalEl.removeClass("cna-image-preview-modal-shell");
		this.contentEl.removeClass("cna-image-preview-modal");
		this.contentEl.empty();
	}
}

export function openImagePreview(app: App, src: string, name: string): void {
	new ImagePreviewModal(app, { src, name }).open();
}
