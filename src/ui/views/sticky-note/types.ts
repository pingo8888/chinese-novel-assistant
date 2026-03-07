export type StickyNoteSortMode =
	| "created_desc"
	| "created_asc"
	| "modified_desc"
	| "modified_asc";

export interface StickyNoteImageModel {
	id: string;
	src: string;
	name: string;
	revokeOnDestroy: boolean;
	vaultPath?: string;
}

export interface StickyNoteCardModel {
	id: string;
	createdAt: number;
	updatedAt: number;
	contentMarkdown: string;
	contentPlainText: string;
	tagsText: string;
	images: StickyNoteImageModel[];
	isImageExpanded: boolean;
	isPinned: boolean;
	colorHex?: string;
}

export interface StickyNoteViewOptions {
	defaultRows: number;
	tagHintTextEnabled: boolean;
	imageAutoExpand: boolean;
}
