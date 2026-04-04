import { kv } from '@vercel/kv';
import { getDateKeyShanghai } from '@/lib/date-key-shanghai';
import { generateFeaturedBundle, type FeaturedBundle } from './reading-featured-generate';

function kvKey(dateKey: string): string {
    return `reading:featured:${dateKey}`;
}

export async function loadFeaturedBundle(dateKey: string): Promise<FeaturedBundle | null> {
    const v = await kv.get<FeaturedBundle>(kvKey(dateKey));
    return v ?? null;
}

export async function saveFeaturedBundle(bundle: FeaturedBundle): Promise<void> {
    await kv.set(kvKey(bundle.dateKey), bundle, { ex: 60 * 60 * 72 });
}

/** 读缓存；若无则 Tavily 生成并写入（与 Cron 共用逻辑） */
export async function ensureFeaturedForDate(dateKey: string): Promise<FeaturedBundle> {
    const cached = await loadFeaturedBundle(dateKey);
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
        return cached;
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('MISSING_TAVILY');
    }

    const bundle = await generateFeaturedBundle(dateKey, apiKey);
    await saveFeaturedBundle(bundle);
    return bundle;
}

export function currentDateKeyShanghai(): string {
    return getDateKeyShanghai();
}
