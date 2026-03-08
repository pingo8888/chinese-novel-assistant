export const STICKY_NOTE_FLOAT_DEFAULT_WIDTH = 292;
export const STICKY_NOTE_FLOAT_DEFAULT_HEIGHT = 119;
export const STICKY_NOTE_FLOAT_MIN_WIDTH = 220;
export const STICKY_NOTE_FLOAT_MIN_HEIGHT = 100;
export const STICKY_NOTE_FLOAT_LEFT_GAP = 14;
const STICKY_NOTE_FLOAT_BASE_ROWS = 6;
const STICKY_NOTE_FLOAT_HEIGHT_PER_ROW = STICKY_NOTE_FLOAT_DEFAULT_HEIGHT / STICKY_NOTE_FLOAT_BASE_ROWS;

export function resolveStickyNoteFloatDefaultHeightByRows(rows: number): number {
	const normalizedRows = Number.isFinite(rows) ? Math.max(1, Math.round(rows)) : STICKY_NOTE_FLOAT_BASE_ROWS;
	return Math.max(STICKY_NOTE_FLOAT_MIN_HEIGHT, Math.round(normalizedRows * STICKY_NOTE_FLOAT_HEIGHT_PER_ROW));
}
