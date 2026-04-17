import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
import { generateLearningArticle, type AiDifficulty } from './_lib/reading-article-generate.js';

/** 单篇生成通常 8-20 秒，保险给 30 秒 */
export const config = { maxDuration: 30 };

/**
 * POST /api/reading-generate
 * body: { topic: string; difficulty?: 1..5 }
 * 即时生成一篇学习文章（自选主题 tab 使用）。
 *
 * 历史 revision 曾用 SSE 流式，但 Vercel Node.js Serverless 对流式响应
 * 有缓冲/转发层级上的不确定性，在某些客户端会直接 "Failed to fetch"。
 * 现改回一次性 JSON 响应；进度条由前端基于时间动画驱动，生成参数也已调小
 * 以缩短真实耗时。
 */
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

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const rl = await consumeRateLimit(getClientIp(req));
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: `Rate limit exceeded (${rl.scope})`, retryAfterSec: rl.retryAfterSec });
        return;
    }

    const body = (req.body ?? {}) as { topic?: unknown; difficulty?: unknown };
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (!topic) {
        res.status(400).json({ error: 'topic is required' });
        return;
    }
    if (topic.length > 200) {
        res.status(400).json({ error: 'topic too long (max 200 chars)' });
        return;
    }

    const rawDiff = typeof body.difficulty === 'number' ? body.difficulty : 3;
    const difficulty = (Math.min(5, Math.max(1, Math.round(rawDiff))) as AiDifficulty);

    const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!deepseekKey) {
        res.status(503).json({
            error: 'Server missing DEEPSEEK_API_KEY',
            detail: '在 Vercel 或本地 .env 配置 DEEPSEEK_API_KEY',
        });
        return;
    }

    try {
        const article = await generateLearningArticle(topic, difficulty, deepseekKey, {
            timeoutMs: 25_000,
        });
        res.status(200).json({
            ok: true,
            topic,
            article,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: '生成失败', detail: msg.slice(0, 400) });
    }
}
