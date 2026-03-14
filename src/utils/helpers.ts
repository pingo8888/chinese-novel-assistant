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

// 按行拆分文本，兼容 CRLF / LF。空文本返回空数组。
export function splitLines(content: string): string[] {
	if (!content) {
		return [];
	}
	return content.split(/\r?\n/);
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

// 规范化正数尺寸，非法或非正值时返回回退值。
export function normalizePositiveSize(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

// 规范化坐标值，非法时回退到 0。
export function normalizePosition(value: number): number {
	return Number.isFinite(value) ? Math.round(value) : 0;
}

// 将数值约束在 [min, max] 区间内。
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// 比较两个字符串数组是否按相同顺序完全一致。
export function areStringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

// 判断字符串是否包含 CJK（中日韩统一表意文字）字符。
export function containsCjk(value: string): boolean {
	return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(value);
}
