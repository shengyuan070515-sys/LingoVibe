import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_MESSAGES = 40; // 防止超长上下文

function cors(res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
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

    // 校验 messages
    if (!Array.isArray(b.messages) || b.messages.length === 0) {
        res.status(400).json({ error: 'Missing or empty messages array' });
        return;
    }

    // 截断过长的消息列表（保留 system + 最后 N 条）
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
