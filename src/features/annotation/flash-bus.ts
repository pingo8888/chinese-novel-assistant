export interface AnnotationLocateFlashPayload {
	sourcePath: string;
	annotationId: string;
}

const locateFlashListeners = new Set<(payload: AnnotationLocateFlashPayload) => void>();

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
