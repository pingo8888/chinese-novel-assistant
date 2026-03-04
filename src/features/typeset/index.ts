import { EditorView, type ViewUpdate } from "@codemirror/view";
import { Plugin } from "obsidian";
import type { PluginContext } from "../../core/context";
import { createHeadingIconExtension } from "./heading-icons";

const TYPESET_ENABLED_CLASS = "cna-typeset-enabled";
const TYPESET_HEADING_ICONS_CLASS = "cna-typeset-heading-icons";
const TYPESET_JUSTIFY_CLASS = "cna-typeset-justify";

const INDENT_CHARS_VAR = "--cna-typeset-indent-chars";
const LINE_SPACING_VAR = "--cna-typeset-line-spacing";
const PARAGRAPH_SPACING_VAR = "--cna-typeset-paragraph-spacing";

export function registerTypesetFeature(plugin: Plugin, ctx: PluginContext): void {
	const feature = new TypesetFeature(plugin, ctx);
	feature.onload();
}

class TypesetFeature {
	private plugin: Plugin;
	private ctx: PluginContext;
	private renderTimer: number | null = null;
	private isUnloaded = false;

	constructor(plugin: Plugin, ctx: PluginContext) {
		this.plugin = plugin;
		this.ctx = ctx;
	}

	onload(): void {
		this.plugin.registerEditorExtension(createHeadingIconExtension());
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.scheduleApply();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("editor-change", () => {
				this.scheduleApply();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", () => {
				this.scheduleApply();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.scheduleApply();
			}),
		);
		this.plugin.registerEditorExtension(
			EditorView.updateListener.of((update: ViewUpdate) => {
				if (update.docChanged || update.viewportChanged || update.geometryChanged || update.focusChanged || update.selectionSet) {
					this.scheduleApply();
				}
			}),
		);

		const unsubscribeSettingsChange = this.ctx.onSettingsChange(() => {
			this.scheduleApply();
		});
		this.plugin.register(() => {
			unsubscribeSettingsChange();
		});

		this.plugin.register(() => {
			this.isUnloaded = true;
			if (this.renderTimer !== null) {
				window.clearTimeout(this.renderTimer);
				this.renderTimer = null;
			}
			this.clear();
		});

		this.scheduleApply();
	}

	private scheduleApply(): void {
		if (this.isUnloaded) {
			return;
		}
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
		}
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			this.apply();
		}, 60);
	}

	private apply(): void {
		const settings = this.ctx.settings;
		const rootEl = this.getRootEl();

		rootEl.classList.toggle(TYPESET_ENABLED_CLASS, settings.typesetEnabled);
		rootEl.classList.toggle(TYPESET_HEADING_ICONS_CLASS, settings.typesetShowHeadingIcons);
		rootEl.classList.toggle(TYPESET_JUSTIFY_CLASS, settings.typesetJustifyText);

		rootEl.style.setProperty(INDENT_CHARS_VAR, String(Math.max(0, settings.typesetIndentChars)));
		rootEl.style.setProperty(LINE_SPACING_VAR, String(Math.max(0, settings.typesetLineSpacing)));
		rootEl.style.setProperty(PARAGRAPH_SPACING_VAR, `${Math.max(0, settings.typesetParagraphSpacing)}px`);
	}

	private clear(): void {
		const rootEl = this.getRootEl();
		rootEl.classList.remove(TYPESET_ENABLED_CLASS, TYPESET_HEADING_ICONS_CLASS, TYPESET_JUSTIFY_CLASS);
		rootEl.style.removeProperty(INDENT_CHARS_VAR);
		rootEl.style.removeProperty(LINE_SPACING_VAR);
		rootEl.style.removeProperty(PARAGRAPH_SPACING_VAR);
	}

	private getRootEl(): HTMLElement {
		const workspaceContainerEl = (this.plugin.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl;
		return workspaceContainerEl ?? document.body;
	}
}
