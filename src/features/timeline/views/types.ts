export interface TimelineEntry {
	id: string;
	timeText: string;
	title: string;
	content: string;
	colorHex?: string;
	order: number;
	createdAt: number;
	updatedAt: number;
}

export interface TimelineCard extends TimelineEntry {
	timelinePath: string;
	contentPlainText: string;
}
