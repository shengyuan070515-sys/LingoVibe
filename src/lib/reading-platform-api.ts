/** 调用自建 Serverless（Bing 搜索 + Jina 抽取），基址由 VITE_READING_API_BASE 提供 */

function apiBase(): string {
    const b = (import.meta.env.VITE_READING_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ?? '';
    return b;
}

export type SearchHit = { url: string; title: string; snippet: string };

export async function platformSearch(q: string, searchApiKey: string): Promise<SearchHit[]> {
    const base = apiBase();
    if (!base) {
        throw new Error('未配置 VITE_READING_API_BASE：请部署 api/ 下函数并写入 .env');
    }
    const r = await fetch(`${base}/api/reading-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, key: searchApiKey }),
    });
    if (!r.ok) {
        let msg = `搜索失败 ${r.status}`;
        try {
            const j = (await r.json()) as { error?: string; detail?: string };
            msg = j.detail || j.error || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    const data = (await r.json()) as { results?: SearchHit[] };
    return Array.isArray(data.results) ? data.results : [];
}

export async function platformExtractMarkdown(url: string): Promise<string> {
    const base = apiBase();
    if (!base) {
        throw new Error('未配置 VITE_READING_API_BASE');
    }
    const r = await fetch(`${base}/api/reading-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
    if (!r.ok) {
        let msg = `正文抽取失败 ${r.status}`;
        try {
            const j = (await r.json()) as { error?: string };
            msg = j.error || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    const data = (await r.json()) as { markdown?: string };
    return typeof data.markdown === 'string' ? data.markdown : '';
}
