import type { VercelRequest, VercelResponse } from '@vercel/node';

type BingWebPage = { url?: string; name?: string; snippet?: string };

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

    const q = typeof (body as { q?: unknown }).q === 'string' ? (body as { q: string }).q.trim() : '';
    const key = typeof (body as { key?: unknown }).key === 'string' ? (body as { key: string }).key.trim() : '';

    if (!q || !key) {
        res.status(400).json({ error: 'Missing q or key' });
        return;
    }

    const searchUrl = new URL('https://api.bing.microsoft.com/v7.0/search');
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('count', '10');
    searchUrl.searchParams.set('mkt', 'en-US');

    const r = await fetch(searchUrl.toString(), {
        headers: { 'Ocp-Apim-Subscription-Key': key },
    });

    if (!r.ok) {
        const t = await r.text();
        res.status(502).json({ error: 'Search provider error', detail: t.slice(0, 400) });
        return;
    }

    const data = (await r.json()) as { webPages?: { value?: BingWebPage[] } };
    const pages = data?.webPages?.value ?? [];
    const results = pages
        .filter((p) => p.url && p.name)
        .map((p) => ({
            url: p.url as string,
            title: p.name as string,
            snippet: typeof p.snippet === 'string' ? p.snippet : '',
        }));

    res.status(200).json({ results });
}
