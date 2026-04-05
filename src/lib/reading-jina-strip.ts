/** 去掉 Jina 等抽取结果顶部的调试标签行（决策：阅读器不展示） */
export function stripJinaReaderPreamble(markdown: string): string {
    const lines = markdown.split('\n');
    let i = 0;
    const isLabelLine = (line: string) => {
        const t = line.trim();
        return /^(title|url\s*source|markdown\s*content|source)\s*:/i.test(t);
    };
    while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') {
            i++;
            continue;
        }
        if (isLabelLine(lines[i])) {
            i++;
            continue;
        }
        break;
    }
    return lines.slice(i).join('\n').replace(/^\s+/, '');
}
