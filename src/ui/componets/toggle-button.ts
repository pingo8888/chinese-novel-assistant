import { setIcon } from "obsidian";

export interface ToggleButtonOptions {
	containerEl: HTMLElement;
	onIcon: string;
	offIcon: string;
	onTooltip: string;
	offTooltip: string;
	initialOn?: boolean;
	className?: string;
	onToggle?: (isOn: boolean) => void;
}

export class ToggleButtonComponent {
	readonly buttonEl: HTMLButtonElement;
	private isOn: boolean;
	private readonly options: ToggleButtonOptions;

	constructor(options: ToggleButtonOptions) {
		this.options = options;
		this.isOn = options.initialOn ?? false;
		const classes = ["clickable-icon", "cna-toggle-button"];
		if (options.className) {
			classes.push(options.className);
		}
		this.buttonEl = options.containerEl.createEl("button", {
			cls: classes.join(" "),
		});
		this.buttonEl.type = "button";
		this.buttonEl.addEventListener("click", this.handleClick);
		this.syncUI();
	}

	getState(): boolean {
		return this.isOn;
	}

	setState(nextOn: boolean): void {
		if (this.isOn === nextOn) {
			return;
		}
		this.isOn = nextOn;
		this.syncUI();
		this.options.onToggle?.(this.isOn);
	}

	toggle(): void {
		this.setState(!this.isOn);
	}

	destroy(): void {
		this.buttonEl.removeEventListener("click", this.handleClick);
	}

	private readonly handleClick = (): void => {
		this.toggle();
	};

	private syncUI(): void {
		const icon = this.isOn ? this.options.onIcon : this.options.offIcon;
		const tooltip = this.isOn ? this.options.onTooltip : this.options.offTooltip;
		this.buttonEl.empty();
		setIcon(this.buttonEl, icon);
		this.buttonEl.setAttr("aria-label", tooltip);
	}
}
