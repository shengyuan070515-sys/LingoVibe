/**
 * 去掉行内 Markdown 链接的语法与 URL，只保留链接文字。
 * 不处理图片语法 ![alt](url)，避免误伤插图。
 */
export function stripMarkdownInlineLinks(source: string): string {
    if (!source) return source;
    return source.replace(/(?<!\!)\[([^\]]*)\]\([^)]*\)/g, '$1');
}
