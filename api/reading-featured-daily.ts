import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
    currentDateKeyShanghai,
    ensureFeaturedForDate,
    loadFeaturedBundle,
} from './_lib/reading-featured-cache.js';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';

/** Vercel: 延长到 60 秒以便首次生成（8 篇文章并行 ~20-30 秒） */
export const config = { maxDuration: 60 };

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
        try {
            const cached = await loadFeaturedBundle(dateKey);
            if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
                res.status(200).json(cached);
                return;
            }
        } catch {
            /* 缓存读失败时退化为生成路径 */
        }

        const bundle = await ensureFeaturedForDate(dateKey);
        res.status(200).json(bundle);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'MISSING_DEEPSEEK') {
            res.status(503).json({
                error: 'Server missing DEEPSEEK_API_KEY',
                detail: '在 Vercel 或本地 .env 配置 DEEPSEEK_API_KEY',
            });
            return;
        }
        if (msg === 'GENERATION_FAILED') {
            res.status(502).json({
                error: 'AI 生成失败',
                detail: '今日精选文章生成失败，请稍后再试',
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
                    '请配置 KV_REST_API_URL、KV_REST_API_TOKEN（Vercel KV / Upstash）。本地可临时设置 READING_FEATURED_SKIP_KV=1 跳过缓存（仅调试）。',
            });
            return;
        }
        res.status(500).json({ error: 'Featured daily failed', detail: msg.slice(0, 400) });
    }
}
