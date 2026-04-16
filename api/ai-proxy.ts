import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, isOriginAllowed } from './_lib/cors.js';
import { verifyRequestSignature } from './_lib/signing.js';
import { consumeRateLimit, getClientIp } from './_lib/rate-limit.js';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_MESSAGES = 40; // 防止超长上下文

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const origin = req.headers.origin as string | undefined;

    // 1) CORS 预检
    applyCors(res, origin);
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    // 2) Origin 白名单校验：POST 请求也要挡
    //    注意：非浏览器客户端（如 curl / Postman）不会发 Origin header——
    //    这种情况直接拒绝，除非带了合法签名（由后面的签名校验兜底）。
    //    所以这里只拒绝"发了但不在白名单"的 origin。
    if (origin && !isOriginAllowed(origin)) {
        res.status(403).json({ error: '来源未授权' });
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
        res.status(503).json({
            error: 'AI 服务未配置',
            detail: '请在 Vercel 项目 Environment Variables 中配置 DEEPSEEK_API_KEY',
        });
        return;
    }

    // 3) 签名校验。要用原始 body 做 HMAC，优先使用 rawBody；
    //    Vercel Node runtime 默认会解析 JSON body，原始字节保留在 req.rawBody（若存在）或需要重新 stringify。
    const rawBody = getRawBody(req);
    const sigCheck = verifyRequestSignature(
        req.headers['x-lv-timestamp'],
        req.headers['x-lv-signature'],
        rawBody
    );
    if (!sigCheck.ok) {
        if (sigCheck.code === 'not_configured') {
            // 服务端自己没配，返回 503 而不是 401
            res.status(503).json({ error: '服务端签名未配置', detail: sigCheck.detail });
            return;
        }
        res.status(401).json({ error: '请求未授权', detail: sigCheck.detail });
        return;
    }

    // 4) IP 限流
    const ip = getClientIp(req);
    const rl = await consumeRateLimit(ip);
    if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        const msg =
            rl.scope === 'minute'
                ? `请求过于频繁，请 ${rl.retryAfterSec} 秒后再试`
                : `今日请求已达上限（${rl.limit} 次），请明日再来`;
        res.status(429).json({ error: msg });
        return;
    }

    // 5) 以下是原来的 DeepSeek 转发逻辑
    let body: unknown = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            res.status(400).json({ error: 'Invalid JSON body' });
            return;
        }
    }

    const b = body as Record<string, unknown>;

    if (!Array.isArray(b.messages) || b.messages.length === 0) {
        res.status(400).json({ error: 'Missing or empty messages array' });
        return;
    }

    let messages = b.messages as Array<{ role: string; content: string }>;
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');
    if (nonSystem.length > MAX_MESSAGES) {
        messages = [...systemMessages, ...nonSystem.slice(-MAX_MESSAGES)];
    }

    const payload = {
        model: 'deepseek-chat',
        messages,
        temperature: typeof b.temperature === 'number' ? b.temperature : 0.6,
        ...(typeof b.max_tokens === 'number' ? { max_tokens: b.max_tokens } : {}),
        ...(b.response_format ? { response_format: b.response_format } : {}),
    };

    try {
        const upstream = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await upstream.json();

        if (!upstream.ok) {
            const msg = (data as any)?.error?.message || `DeepSeek error ${upstream.status}`;
            res.status(upstream.status >= 500 ? 502 : upstream.status).json({
                error: msg,
            });
            return;
        }

        res.status(200).json(data);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upstream request failed';
        res.status(502).json({ error: 'AI 代理请求失败', detail: msg.slice(0, 500) });
    }
}

/**
 * 从 Vercel 的 VercelRequest 中取到用于签名的 rawBody。
 * Vercel Node runtime 会把 JSON body 解析到 req.body，但在签名校验这里我们需要"前端实际发送的字节串"。
 * 约定：前端发送前先 JSON.stringify 一次，用同样的字符串参与签名。
 */
function getRawBody(req: VercelRequest): string {
    // 部分版本 Vercel 会暴露 req.rawBody（Buffer）
    const anyReq = req as unknown as { rawBody?: Buffer | string };
    if (anyReq.rawBody) {
        return typeof anyReq.rawBody === 'string' ? anyReq.rawBody : anyReq.rawBody.toString('utf8');
    }
    // 回退：用 req.body 反推。前端和后端都必须用 JSON.stringify 的确定性输出
    if (typeof req.body === 'string') return req.body;
    try {
        return JSON.stringify(req.body ?? {});
    } catch {
        return '';
    }
}
