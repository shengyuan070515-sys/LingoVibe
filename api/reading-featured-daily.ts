import type { VercelRequest, VercelResponse } from '@vercel/node';
import { currentDateKeyShanghai, ensureFeaturedForDate } from './_lib/reading-featured-cache.js';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const origin = req.headers.origin as string | undefined;
    applyCors(res, origin);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (origin && !isOriginAllowed(origin)) {
        res.status(403).json({ error: 'Origin not allowed' });
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }

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
        if (
            msg.includes('KV_ERROR') ||
            msg.includes('KV_REST') ||
            msg.includes('UPSTASH') ||
            msg.includes('Redis') ||
            msg.includes('REDIS')
        ) {
            res.status(503).json({
                error: 'KV not configured',
                detail:
                    '请配置 KV_REST_API_URL、KV_REST_API_TOKEN（Vercel KV / Upstash）。本地可临时设置 READING_FEATURED_SKIP_KV=1 跳过缓存（仅调试，会每次打 Tavily）。',
            });
            return;
        }
        res.status(500).json({ error: 'Featured daily failed', detail: msg.slice(0, 400) });
    }
}
