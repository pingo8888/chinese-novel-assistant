export interface CollectGuidebookAliasesOptions {
	keyword: string;
	content: string;
	enableWesternNameAutoAlias: boolean;
}

export function collectGuidebookAliases(options: CollectGuidebookAliasesOptions): string[] {
	const normalizedKeyword = options.keyword.trim();
	const aliasSet = new Set<string>(parseExplicitAliasesFromGuidebookContent(options.content));
	if (options.enableWesternNameAutoAlias) {
		const autoAlias = resolveWesternNameAutoAlias(normalizedKeyword);
		if (autoAlias && autoAlias !== normalizedKeyword) {
			aliasSet.add(autoAlias);
		}
	}
	return Array.from(aliasSet);
}

function parseExplicitAliasesFromGuidebookContent(content: string): string[] {
	const aliasSet = new Set<string>();
	for (const line of content.split(/\r?\n/)) {
		const aliasMatch = line.match(/【别名】\s*[:：]?\s*(.+)$/);
		if (!aliasMatch) {
			continue;
		}
		const aliasText = (aliasMatch[1] ?? "").trim();
		if (aliasText.length === 0) {
			continue;
		}
		for (const alias of aliasText.split(/[，,]/)) {
			const normalizedAlias = alias.trim();
			if (normalizedAlias.length > 0) {
				aliasSet.add(normalizedAlias);
			}
		}
	}
	return Array.from(aliasSet);
}

function resolveWesternNameAutoAlias(keyword: string): string | null {
	const normalizedKeyword = keyword.trim();
	if (normalizedKeyword.length === 0) {
		return null;
	}
	const firstMiddleDotIndex = normalizedKeyword.indexOf("·");
	if (firstMiddleDotIndex <= 0) {
		return null;
	}
	const firstSegment = normalizedKeyword.slice(0, firstMiddleDotIndex).trim();
	return firstSegment.length > 0 ? firstSegment : null;
}
