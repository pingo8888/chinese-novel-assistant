import { App, type FuzzyMatch, FuzzySuggestModal, Notice, TFile } from "obsidian";
import type { TranslationKey } from "../../lang";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic", "heif", "tiff"]);

interface VaultImagePickerModalDeps {
	app: App;
	files: TFile[];
	t: (key: TranslationKey) => string;
	onResult: (file: TFile | null) => void;
}

class VaultImagePickerModal extends FuzzySuggestModal<TFile> {
	private readonly files: TFile[];
	private readonly t: (key: TranslationKey) => string;
	private readonly onResult: (file: TFile | null) => void;
	private resolved = false;

	constructor(deps: VaultImagePickerModalDeps) {
		super(deps.app);
		this.files = deps.files;
		this.t = deps.t;
		this.onResult = deps.onResult;
		this.setPlaceholder(this.t("feature.sticky_note.image.pick.placeholder"));
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
		const file = match.item;
		el.addClass("cna-vault-image-picker__suggestion");
		el.createDiv({
			cls: "cna-vault-image-picker__name",
			text: file.name,
		});
		el.createDiv({
			cls: "cna-vault-image-picker__path",
			text: file.path,
		});
	}

	onChooseItem(file: TFile): void {
		this.finish(file);
	}

	onClose(): void {
		super.onClose();
		// Some Obsidian versions close the modal before firing choose callbacks.
		// Delay the cancel resolution to avoid overriding a just-selected file result.
		queueMicrotask(() => {
			if (!this.resolved) {
				this.resolved = true;
				this.onResult(null);
			}
		});
	}

	private finish(file: TFile | null): void {
		if (!this.resolved) {
			this.resolved = true;
			this.onResult(file);
		}
		this.close();
	}
}

export function isImageVaultFile(file: TFile): boolean {
	return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

export function promptVaultImageFile(app: App, t: (key: TranslationKey) => string): Promise<TFile | null> {
	const imageFiles = app.vault
		.getFiles()
		.filter(isImageVaultFile)
		.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));

	if (imageFiles.length === 0) {
		new Notice(t("feature.sticky_note.image.pick.empty"));
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		new VaultImagePickerModal({
			app,
			files: imageFiles,
			t,
			onResult: resolve,
		}).open();
	});
}


