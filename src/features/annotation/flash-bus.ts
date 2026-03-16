export interface AnnotationLocateFlashPayload {
	sourcePath: string;
	annotationId: string;
}

export interface AnnotationCreatedPayload {
	sourcePath: string;
	annotationPath: string;
	annotationId: string;
}

const locateFlashListeners = new Set<(payload: AnnotationLocateFlashPayload) => void>();
const annotationCreatedListeners = new Set<(payload: AnnotationCreatedPayload) => void>();

export function emitAnnotationLocateFlash(payload: AnnotationLocateFlashPayload): void {
	for (const listener of Array.from(locateFlashListeners)) {
		try {
			listener(payload);
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to notify annotation locate flash listener.", error);
		}
	}
}

export function subscribeAnnotationLocateFlash(
	listener: (payload: AnnotationLocateFlashPayload) => void,
): () => void {
	locateFlashListeners.add(listener);
	return () => {
		locateFlashListeners.delete(listener);
	};
}

export function emitAnnotationCreated(payload: AnnotationCreatedPayload): void {
	for (const listener of Array.from(annotationCreatedListeners)) {
		try {
			listener(payload);
		} catch (error) {
			console.error("[Chinese Novel Assistant] Failed to notify annotation created listener.", error);
		}
	}
}

export function subscribeAnnotationCreated(
	listener: (payload: AnnotationCreatedPayload) => void,
): () => void {
	annotationCreatedListeners.add(listener);
	return () => {
		annotationCreatedListeners.delete(listener);
	};
}
