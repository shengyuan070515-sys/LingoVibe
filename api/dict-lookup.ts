import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
import { lookupWord } from './_lib/dict-lookup.js';
import { DictDbNotReadyError } from './_lib/db.js';

/**
 * GET /api/dict-lookup?word=xxx
 *
 * 视觉词典的优先数据源：先命中离线词典（Neon Postgres），
 * 返回 { hit: true, entry: { ... } }。
 *
 * 若词典未配置 → { hit: false, reason: 'db_not_ready' }
 * 若词典里查不到 → { hit: false, reason: 'not_found' }
 * 前端拿到 `hit: false` 时再走原来的 DeepSeek fallback（fetchReadingWordCard）。
 */

export const config = { maxDuration: 10 };

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

    const wordRaw = typeof req.query.word === 'string' ? req.query.word : '';
    if (!wordRaw) {
        res.status(400).json({ error: 'word is required' });
        return;
    }
    if (wordRaw.length > 60) {
        res.status(400).json({ error: 'word too long' });
        return;
    }

    try {
        const entry = await lookupWord(wordRaw);
        /** 走 CDN 短缓存：热门词几秒内不会重复打数据库 */
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        if (!entry) {
            res.status(200).json({ hit: false, reason: 'not_found' });
            return;
        }
        res.status(200).json({ hit: true, entry });
    } catch (e) {
        if (e instanceof DictDbNotReadyError) {
            res.status(200).json({ hit: false, reason: 'db_not_ready' });
            return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[dict-lookup] error', msg);
        res.status(500).json({ hit: false, reason: 'error', detail: msg.slice(0, 200) });
    }
}
