export interface AnnotationEntry {
	id: string;
	title: string;
	content: string;
	sourcePath: string;
	anchorOffset: number;
	anchorEndOffset: number;
	line: number;
	ch: number;
	colorHex?: string;
	createdAt: number;
	updatedAt: number;
}

export interface AnnotationCard extends AnnotationEntry {
	annoPath: string;
	contentPlainText: string;
	anchorText: string;
}
