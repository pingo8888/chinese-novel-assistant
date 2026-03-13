// 生成指定长度的随机大写字母数字串。
export function buildRandomToken(length: number): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let token = "";
	for (let index = 0; index < length; index += 1) {
		const nextIndex = Math.floor(Math.random() * chars.length);
		token += chars[nextIndex] ?? "X";
	}
	return token;
}

// 将数字格式化为两位字符串，不足前补 0。
export function pad2(value: number): string {
	return `${value}`.padStart(2, "0");
}

// 解析并校验 6 位十六进制颜色值（例如 #4A86E9）。
export function parseColorHex(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim();
	if (!normalized) {
		return undefined;
	}
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : undefined;
}

// 从 unknown 中提取布尔值，类型不匹配时返回回退值。
export function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

// 从 unknown 中提取有限数值，支持数字字符串，失败时返回回退值。
export function asNumber(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

// 判断值是否为普通对象（非 null、非数组）。
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
