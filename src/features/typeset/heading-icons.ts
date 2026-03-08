import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import { UI } from "../../constants/ui";

const TYPESET_HEADING_ICON_EL_CLASS = "cna-typeset-heading-icon";
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
const HEADING_ICON_BY_LEVEL: Record<HeadingLevel, string> = {
	1: UI.icon.h1,
	2: UI.icon.h2,
	3: UI.icon.h3,
	4: UI.icon.h4,
	5: UI.icon.h5,
	6: UI.icon.h6,
};
const HEADING_REGEX = /^\s{0,3}(#{1,6})\s+/;

class HeadingIconWidget extends WidgetType {
	private level: HeadingLevel;

	constructor(level: HeadingLevel) {
		super();
		this.level = level;
	}

	eq(other: HeadingIconWidget): boolean {
		return other.level === this.level;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = TYPESET_HEADING_ICON_EL_CLASS;
		el.dataset.headingLevel = String(this.level);
		setIcon(el, HEADING_ICON_BY_LEVEL[this.level]);
		return el;
	}
}

function buildHeadingIconDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	for (const { from, to } of view.visibleRanges) {
		let line = view.state.doc.lineAt(from);
		while (line.from <= to) {
			const match = line.text.match(HEADING_REGEX);
			if (match) {
				const hashes = match[1];
				if (!hashes) {
					if (line.to >= to || line.number >= view.state.doc.lines) {
						break;
					}
					line = view.state.doc.line(line.number + 1);
					continue;
				}
				const level = Number(hashes.length) as HeadingLevel;
				builder.add(
					line.from,
					line.from,
					Decoration.widget({
						widget: new HeadingIconWidget(level),
						side: -1,
					}),
				);
			}
			if (line.to >= to || line.number >= view.state.doc.lines) {
				break;
			}
			line = view.state.doc.line(line.number + 1);
		}
	}
	return builder.finish();
}

export function createHeadingIconExtension() {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildHeadingIconDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.decorations = buildHeadingIconDecorations(update.view);
				}
			}
		},
		{
			decorations: (value) => value.decorations,
		},
	);
}
