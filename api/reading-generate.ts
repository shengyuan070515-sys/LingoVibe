import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';
import { generateLearningArticleStream, type AiDifficulty } from './_lib/reading-article-generate.js';

/** 单篇生成通常 15-30 秒，保险起见给 45 秒 */
export const config = { maxDuration: 45 };

/**
 * POST /api/reading-generate
 * body: { topic: string; difficulty?: 1..5 }
 *
 * 返回 Server-Sent Events（text/event-stream）：
 *   data: { type: "progress", total: <累计字符数> }
 *   data: { type: "done", article: {...} }
 *   data: { type: "error", message: "..." }
 *
 * 前端可据此显示真实进度条，不再是盲等 15-30 秒。
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

    /** 进入 SSE 流式响应 */
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    /** 刷出 headers，让浏览器尽早进入"接收中"状态 */
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    /** 心跳注释帧，防止部分中间层（负载均衡/代理）在无数据时断开连接 */
    const heartbeat = setInterval(() => {
        try {
            res.write(': keep-alive\n\n');
        } catch {
            /** 连接已关闭 */
        }
    }, 8000);

    const writeEvent = (obj: unknown) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
        for await (const evt of generateLearningArticleStream(topic, difficulty, deepseekKey)) {
            if (evt.type === 'chunk') {
                writeEvent({ type: 'progress', total: evt.total });
            } else {
                writeEvent({ type: 'done', topic, article: evt.article });
            }
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        writeEvent({ type: 'error', message: msg.slice(0, 400) });
    } finally {
        clearInterval(heartbeat);
        res.end();
    }
}
