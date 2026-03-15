export type AnnotationCardMenuCommand =
	| { type: "set_color"; colorHex: string }
	| { type: "delete" };

export type AnnotationCardMenuActionResult = "updated" | "deleted" | "noop";

export interface AnnotationCardMenuTarget {
	colorHex?: string;
	updatedAt: number;
}

export function applyAnnotationCardMenuCommand(
	command: AnnotationCardMenuCommand,
	target: AnnotationCardMenuTarget,
): AnnotationCardMenuActionResult {
	switch (command.type) {
		case "set_color":
			if (target.colorHex === command.colorHex) {
				return "noop";
			}
			target.colorHex = command.colorHex;
			target.updatedAt = Date.now();
			return "updated";
		case "delete":
			return "deleted";
		default:
			return "noop";
	}
}
