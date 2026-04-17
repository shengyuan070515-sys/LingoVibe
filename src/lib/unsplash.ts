/**
 * Unsplash 图片查询：
 * 1. 优先使用 VITE_UNSPLASH_ACCESS_KEY 调 /search/photos（真实 API，结果最相关）
 * 2. 无 key 或 API 失败 → 回退到基于词哈希的图片池（不同词拿到不同图，保证视觉多样性）
 */

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
    const envKey = (import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined)?.trim();
    if (envKey) return envKey;

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

/**
 * 一个覆盖自然 / 人文 / 城市 / 食物 / 抽象 / 动物 / 科技 的 Unsplash 图片池。
 * 没有 Unsplash key 时，按词 hash 确定性地取若干张，保证：
 * - 同一个词每次看到相同的图（视觉一致性）
 * - 不同词大概率看到不同的图（打破"张张一样"的尴尬）
 * 全部使用稳定的 Unsplash CDN 路径，不依赖任何在线 API。
 */
const FALLBACK_POOL: readonly string[] = [
    'photo-1506744038136-46273834b3fb', 'photo-1469474968028-56623f02e42e',
    'photo-1441974231531-c6227db76b6e', 'photo-1500530855697-b586d89ba3ee',
    'photo-1520975958225-8797b54e3c08', 'photo-1501785888041-af3ef285b470',
    'photo-1476231682828-37e571bc172f', 'photo-1465146344425-f00d5f5c8f07',
    'photo-1470770841072-f978cf4d019e', 'photo-1418065460487-3e41a6c84dc5',
    'photo-1542273917363-3b1817f69a2d', 'photo-1493246507139-91e8fad9978e',
    'photo-1493515322954-4fa727e97985', 'photo-1483794344563-d27a8d18014e',
    'photo-1504198458649-3128b932f49e', 'photo-1508739773434-c26b3d09e071',
    'photo-1504674900247-0877df9cc836', 'photo-1498050108023-c5249f4df085',
    'photo-1506905925346-21bda4d32df4', 'photo-1519046904884-53103b34b206',
    'photo-1516728778615-2d590ea1855e', 'photo-1493770348161-369560ae357d',
    'photo-1528825871115-3581a5387919', 'photo-1534528741775-53994a69daeb',
    'photo-1517685352821-92cf88aee5a5', 'photo-1483736762161-1d107f3c78e1',
    'photo-1517021897933-0e0319cfbc28', 'photo-1485827404703-89b55fcc595e',
    'photo-1532009324734-20a7a5813719', 'photo-1481349518771-20055b2a7b24',
];

function hashString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function buildFallbackUrls(query: string, perPage: number): string[] {
    const base = hashString(query.toLowerCase());
    const pool = FALLBACK_POOL;
    const n = Math.min(Math.max(perPage, 1), pool.length);
    const out: string[] = [];
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
        let idx = (base + i * 2654435761) >>> 0;
        idx = idx % pool.length;
        let tries = 0;
        while (used.has(idx) && tries < pool.length) {
            idx = (idx + 1) % pool.length;
            tries++;
        }
        used.add(idx);
        out.push(`https://images.unsplash.com/${pool[idx]}?auto=format&fit=crop&w=1200&q=80`);
    }
    return out;
}
