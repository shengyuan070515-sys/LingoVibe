import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, isOriginAllowed } from './_lib/cors.js';

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

    let body: unknown = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body) as unknown;
        } catch {
            res.status(400).json({ error: 'Invalid JSON body' });
            return;
        }
    }

    const url =
        typeof (body as { url?: unknown }).url === 'string' ? (body as { url: string }).url.trim() : '';
    if (!url) {
        res.status(400).json({ error: 'Missing url' });
        return;
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.status(400).json({ error: 'Only http/https URLs are allowed' });
        return;
    }

    const host = parsed.hostname;
    if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.local') ||
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
        host === '169.254.169.254'
    ) {
        res.status(400).json({ error: 'Private/internal URLs are not allowed' });
        return;
    }

    const MAX_BODY_BYTES = 512_000;

    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const r = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain,text/markdown,*/*' },
    });

    if (!r.ok) {
        res.status(502).json({ error: 'Extract failed', status: r.status });
        return;
    }

    const markdown = (await r.text()).slice(0, MAX_BODY_BYTES);
    res.status(200).json({ markdown, title: null as string | null });
}
