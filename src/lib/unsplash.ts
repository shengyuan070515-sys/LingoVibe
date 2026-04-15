export async function fetchUnsplashImages(query: string, options?: { perPage?: number }): Promise<string[]> {
    const q = (query || '').trim();
    if (!q) return [];

    const perPage = options?.perPage ?? 3;

    const apiKey = safeGetUnsplashApiKey();
    if (!apiKey) return buildFallbackUrls(q, perPage);

    try {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${perPage}&client_id=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url);
        if (!res.ok) return buildFallbackUrls(q, perPage);

        const data: any = await res.json().catch(() => null);
        const urls: string[] =
            data?.results?.map((r: any) => r?.urls?.regular).filter(Boolean) || [];

        return urls.length > 0 ? urls : buildFallbackUrls(q, perPage);
    } catch {
        return buildFallbackUrls(q, perPage);
    }
}

function safeGetUnsplashApiKey(): string {
    // 优先使用环境变量（Vercel 部署时在 VITE_UNSPLASH_ACCESS_KEY 中配置）
    const envKey = (import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined)?.trim();
    if (envKey) return envKey;

    // 其次使用用户在设置页填写的 key
    try {
        const raw = localStorage.getItem('unsplash_api_key');
        if (typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        try {
            const parsed = JSON.parse(trimmed);
            return typeof parsed === 'string' ? parsed.trim() : '';
        } catch {
            return trimmed;
        }
    } catch {
        return '';
    }
}

function buildFallbackUrls(query: string, perPage: number): string[] {
    const q = encodeURIComponent(query);
    const seeds = [
        'photo-1506744038136-46273834b3fb',
        'photo-1469474968028-56623f02e42e',
        'photo-1441974231531-c6227db76b6e',
        'photo-1500530855697-b586d89ba3ee',
        'photo-1520975958225-8797b54e3c08',
    ];

    const out: string[] = [];
    for (let i = 0; i < Math.min(perPage, seeds.length); i++) {
        out.push(`https://images.unsplash.com/${seeds[i]}?auto=format&fit=crop&w=1200&q=80&sig=${i + 1}&q=${q}`);
    }
    return out;
}

