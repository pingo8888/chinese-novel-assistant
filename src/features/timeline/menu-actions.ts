export type TimelineCardMenuCommand =
	| { type: "set_color"; colorHex: string }
	| { type: "insert_before" }
	| { type: "insert_after" }
	| { type: "delete" };

export type TimelineCardMenuActionResult = "updated" | "deleted" | "insert_before" | "insert_after" | "noop";

export interface TimelineCardMenuTarget {
	colorHex?: string;
	updatedAt: number;
}

export function applyTimelineCardMenuCommand(
	command: TimelineCardMenuCommand,
	target: TimelineCardMenuTarget,
): TimelineCardMenuActionResult {
	switch (command.type) {
		case "set_color":
			if (target.colorHex === command.colorHex) {
				return "noop";
			}
			target.colorHex = command.colorHex;
			target.updatedAt = Date.now();
			return "updated";
		case "insert_before":
			return "insert_before";
		case "insert_after":
			return "insert_after";
		case "delete":
			return "deleted";
		default:
			return "noop";
	}
}
