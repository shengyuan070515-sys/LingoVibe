import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchTavily } from './_lib/tavily-search.js';

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

    try {
        const results = await searchTavily(q, apiKey, 12);
        res.status(200).json({ results });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Tavily failed';
        res.status(502).json({ error: 'Tavily request failed', detail: msg.slice(0, 500) });
    }
}
