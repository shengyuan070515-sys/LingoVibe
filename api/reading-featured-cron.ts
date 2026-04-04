import type { VercelRequest, VercelResponse } from '@vercel/node';
import { currentDateKeyShanghai, ensureFeaturedForDate } from './lib/reading-featured-cache';

/**
 * Vercel Cron 使用 GET；也可 POST 手动触发。
 * Authorization: Bearer <CRON_SECRET>
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const secret = process.env.CRON_SECRET?.trim();
    const auth = req.headers.authorization;
    const ok = secret && auth === `Bearer ${secret}`;
    if (!ok) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const dateKey = currentDateKeyShanghai();

    try {
        const bundle = await ensureFeaturedForDate(dateKey);
        res.status(200).json({ ok: true, dateKey, count: bundle.items.length });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'MISSING_TAVILY') {
            res.status(503).json({ error: 'MISSING_TAVILY' });
            return;
        }
        res.status(500).json({ error: 'Cron failed', detail: msg.slice(0, 400) });
    }
}
