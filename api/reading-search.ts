import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Tavily Search API：https://api.tavily.com/search */
type TavilyResult = {
    title?: string;
    url?: string;
    content?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    let body: unknown = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body) as unknown;
        } catch {
            res.status(400).json({ error: 'Invalid JSON body' });
            return;
        }
    }

    const q = typeof (body as { q?: unknown }).q === 'string' ? (body as { q: string }).q.trim() : '';

    if (!q) {
        res.status(400).json({ error: 'Missing q' });
        return;
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
        res.status(503).json({
            error: 'Server missing TAVILY_API_KEY',
            detail: '在 Vercel 项目 Environment Variables 或本地 .env 中配置 TAVILY_API_KEY',
        });
        return;
    }

    const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            query: q,
            max_results: 12,
            search_depth: 'basic',
            topic: 'general',
            include_answer: false,
        }),
    });

    if (!r.ok) {
        const t = await r.text();
        res.status(502).json({ error: 'Tavily request failed', detail: t.slice(0, 500) });
        return;
    }

    const data = (await r.json()) as { results?: TavilyResult[] };
    const raw = Array.isArray(data.results) ? data.results : [];
    const results = raw
        .filter((item) => item.url && item.title)
        .map((item) => ({
            url: item.url as string,
            title: item.title as string,
            snippet: typeof item.content === 'string' ? item.content.slice(0, 500) : '',
        }));

    res.status(200).json({ results });
}
