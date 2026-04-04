import type { VercelRequest, VercelResponse } from '@vercel/node';
import { currentDateKeyShanghai, ensureFeaturedForDate } from './lib/reading-featured-kv';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    const dateKey =
        typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
            ? req.query.date
            : currentDateKeyShanghai();

    try {
        const bundle = await ensureFeaturedForDate(dateKey);
        res.status(200).json(bundle);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'MISSING_TAVILY') {
            res.status(503).json({
                error: 'Server missing TAVILY_API_KEY',
                detail: '在 Vercel 或本地 .env 配置 TAVILY_API_KEY',
            });
            return;
        }
        if (msg.includes('KV') || msg.includes('kv') || msg.includes('REDIS')) {
            res.status(503).json({
                error: 'KV not configured',
                detail: '请配置 Vercel KV / Upstash（KV_REST_API_URL、KV_REST_API_TOKEN）',
            });
            return;
        }
        res.status(500).json({ error: 'Featured daily failed', detail: msg.slice(0, 400) });
    }
}
