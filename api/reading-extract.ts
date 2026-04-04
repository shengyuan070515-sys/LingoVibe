import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const r = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain,text/markdown,*/*' },
    });

    if (!r.ok) {
        res.status(502).json({ error: 'Extract failed', status: r.status });
        return;
    }

    const markdown = await r.text();
    res.status(200).json({ markdown, title: null as string | null });
}
