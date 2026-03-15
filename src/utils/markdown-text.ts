// 提取 Markdown 的可读纯文本，主要用于搜索、比对、预览摘要等场景。
export function extractPlainTextFromMarkdown(markdown: string): string {
	return markdown
		// 去除代码块，避免把大段代码纳入正文。
		.replace(/```[\s\S]*?```/g, " ")
		// 行内代码保留文本本身，移除包裹反引号。
		.replace(/`([^`]+)`/g, "$1")
		// 图片/链接仅保留可读标题文本。
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
		// 去除标题、引用、列表等结构标记。
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^\s*>\s?/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*\d+\.\s+/gm, "")
		// 清理常见强调/分隔符，并规范空白。
		.replace(/[*_~`>#]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
