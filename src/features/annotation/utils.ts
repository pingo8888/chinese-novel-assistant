export function normalizeVaultPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

export function toRgba(hex: string, alpha: number): string {
	const normalized = hex.trim().replace("#", "");
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		return hex;
	}
	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	const clampedAlpha = Math.max(0, Math.min(1, alpha));
	return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}
