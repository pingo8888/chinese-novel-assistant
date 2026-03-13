export type StickyNoteSortMode =
	| "created_desc"
	| "created_asc"
	| "modified_desc"
	| "modified_asc";

export interface StickyNoteImage {
	id: string;
	src: string;
	revokeOnDestroy: boolean;
	vaultPath?: string;
}

export interface StickyNoteCard {
	id: string;
	sourcePath: string;
	cwData: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
	contentMarkdown: string;
	contentPlainText: string;
	tagsText: string;
	images: StickyNoteImage[];
	isImageExpanded: boolean;
	isPinned: boolean;
	colorHex?: string;
	isFloating: boolean;
	floatX: number;
	floatY: number;
	floatW: number;
	floatH: number;
}

export interface StickyNoteViewOptions {
	defaultRows: number;
	tagHintTextEnabled: boolean;
}

