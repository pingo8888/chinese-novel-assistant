import { Setting, type App, type ColorComponent, type TextComponent } from "obsidian";
import { askForConfirmation } from "../../../ui";
import { parseColorHex, toRgba } from "../../../utils";
import { createSettingsSectionHeading } from "./heading";

export interface ColorConfigItem {
	key: string;
	name: string;
	colorHex: string;
}

export interface TypeConfigItem {
	key: string;
	name: string;
	// Display text shown in the label input for this type.
	label: string;
	colorHex: string;
}

interface BaseConfigGroupOptions {
	app: App;
	panelEl: HTMLElement;
	sectionTitle: string;
	disabled?: boolean;
	restoreDefaultsName: string;
	restoreDefaultsDesc: string;
	restoreDefaultsLabel: string;
	restoreDefaultsConfirmText: string;
	restoreDefaultsCancelText: string;
	labelInputPlaceholder: string;
	colorInputPlaceholder: string;
	onRestoreDefaults: () => Promise<void>;
}

interface ColorConfigGroupOptions extends BaseConfigGroupOptions {
	items: ColorConfigItem[];
	onColorChange: (key: string, colorHex: string) => Promise<void>;
}

interface TypeConfigGroupOptions extends BaseConfigGroupOptions {
	items: TypeConfigItem[];
	onLabelChange: (key: string, label: string) => Promise<void>;
	onColorChange: (key: string, colorHex: string) => Promise<void>;
}

export function renderColorConfigGroup(options: ColorConfigGroupOptions): void {
	createSettingsSectionHeading(options.panelEl, options.sectionTitle);
	const disabled = options.disabled ?? false;
	renderRestoreDefaultsSetting(
		options.panelEl,
		options.restoreDefaultsName,
		options.restoreDefaultsDesc,
		options.restoreDefaultsLabel,
		options.restoreDefaultsConfirmText,
		options.restoreDefaultsCancelText,
		options.app,
		disabled,
		options.onRestoreDefaults,
	);

	for (const item of options.items) {
		const setting = new Setting(options.panelEl)
			.setName(item.name)
			.setClass("cna-settings-item")
			.setDisabled(disabled);
		addColorInputWithPicker(setting, {
			initialColorHex: item.colorHex,
			disabled,
			placeholder: options.colorInputPlaceholder,
			onColorChange: async (nextColorHex) => {
				await options.onColorChange(item.key, nextColorHex);
			},
		});
	}
}

export function renderTypeConfigGroup(options: TypeConfigGroupOptions): void {
	createSettingsSectionHeading(options.panelEl, options.sectionTitle);
	const disabled = options.disabled ?? false;
	renderRestoreDefaultsSetting(
		options.panelEl,
		options.restoreDefaultsName,
		options.restoreDefaultsDesc,
		options.restoreDefaultsLabel,
		options.restoreDefaultsConfirmText,
		options.restoreDefaultsCancelText,
		options.app,
		disabled,
		options.onRestoreDefaults,
	);

	for (const item of options.items) {
		const setting = new Setting(options.panelEl)
			.setName(item.name)
			.setClass("cna-settings-item")
			.setDisabled(disabled)
			.addText((text) =>
				text
					.setPlaceholder(options.labelInputPlaceholder)
					.setValue(item.label)
					.setDisabled(disabled)
					.onChange(async (value) => {
						const normalized = value.trim();
						if (normalized === item.label) {
							return;
						}
						await options.onLabelChange(item.key, normalized);
					}),
			);
		addColorInputWithPicker(setting, {
			initialColorHex: item.colorHex,
			disabled,
			placeholder: options.colorInputPlaceholder,
			onColorChange: async (nextColorHex) => {
				await options.onColorChange(item.key, nextColorHex);
			},
		});
	}
}

function renderRestoreDefaultsSetting(
	panelEl: HTMLElement,
	name: string,
	desc: string,
	buttonText: string,
	confirmText: string,
	cancelText: string,
	app: App,
	disabled: boolean,
	onRestoreDefaults: () => Promise<void>,
): void {
	new Setting(panelEl)
		.setName(name)
		.setDesc(desc)
		.setClass("cna-settings-item")
		.setDisabled(disabled)
		.addButton((button) =>
			button.setButtonText(buttonText).setCta().setDisabled(disabled).onClick(async () => {
				const confirmed = await askForConfirmation(app, {
					title: name,
					message: desc,
					confirmText,
					cancelText,
				});
				if (!confirmed) {
					return;
				}
				await onRestoreDefaults();
			}),
		);
}

interface ColorInputWithPickerOptions {
	initialColorHex: string;
	disabled: boolean;
	placeholder: string;
	onColorChange: (nextColorHex: string) => Promise<void>;
}

function addColorInputWithPicker(setting: Setting, options: ColorInputWithPickerOptions): void {
	let currentColorHex = options.initialColorHex.toUpperCase();
	let isSyncing = false;
	let textComponent: TextComponent | null = null;
	let colorComponent: ColorComponent | null = null;
	let swatchEl: HTMLElement | null = null;
	let nativePickerInputEl: HTMLInputElement | null = null;

	const syncColorControls = (nextColorHex: string): void => {
		isSyncing = true;
		textComponent?.setValue(nextColorHex);
		colorComponent?.setValue(nextColorHex);
		isSyncing = false;
		applySwatchTone(nextColorHex);
	};

	const applySwatchTone = (colorHex: string): void => {
		if (!swatchEl) {
			return;
		}
		swatchEl.style.setProperty("--cna-settings-color-swatch", colorHex);
		swatchEl.style.setProperty("--cna-settings-color-swatch-alpha", toRgba(colorHex, 0.25));
	};

	setting.addText((text) => {
		textComponent = text;
		text
			.setPlaceholder(options.placeholder)
			.setValue(currentColorHex)
			.setDisabled(options.disabled)
			.onChange(async (value) => {
				if (isSyncing) {
					return;
				}
				const normalized = parseColorHex(value);
				const nextColorHex = normalized?.toUpperCase();
				if (!nextColorHex || nextColorHex === currentColorHex) {
					return;
				}
				currentColorHex = nextColorHex;
				syncColorControls(nextColorHex);
				await options.onColorChange(nextColorHex);
			});
	});

	setting.addColorPicker((picker) => {
		colorComponent = picker;
		picker
			.setValue(currentColorHex)
			.setDisabled(options.disabled)
			.onChange(async (value) => {
				if (isSyncing) {
					return;
				}
				const normalized = parseColorHex(value);
				const nextColorHex = normalized?.toUpperCase();
				if (!nextColorHex || nextColorHex === currentColorHex) {
					return;
				}
				currentColorHex = nextColorHex;
				syncColorControls(nextColorHex);
				await options.onColorChange(nextColorHex);
			});
	});

	nativePickerInputEl = setting.controlEl.querySelector<HTMLInputElement>('input[type="color"]');
	if (nativePickerInputEl) {
		const pickerWrapEl = setting.controlEl.createDiv({
			cls: "cna-settings-color-picker-wrap",
		});
		if (options.disabled) {
			pickerWrapEl.classList.add("is-disabled");
		}
		swatchEl = pickerWrapEl.createDiv({
			cls: "cna-settings-color-swatch",
			attr: {
				"aria-hidden": "true",
			},
		});
		pickerWrapEl.appendChild(nativePickerInputEl);
		nativePickerInputEl.classList.add("cna-settings-color-picker-native");
		applySwatchTone(currentColorHex);
	}
}
