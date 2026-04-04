import { kv } from '@vercel/kv';
import { getDateKeyShanghai } from '../../src/lib/date-key-shanghai.js';
import { generateFeaturedBundle, type FeaturedBundle } from './reading-featured-generate.js';

function kvKey(dateKey: string): string {
    return `reading:featured:${dateKey}`;
}

function skipKv(): boolean {
    return process.env.READING_FEATURED_SKIP_KV === '1' || process.env.READING_FEATURED_SKIP_KV === 'true';
}

export async function loadFeaturedBundle(dateKey: string): Promise<FeaturedBundle | null> {
    if (skipKv()) return null;
    try {
        const v = await kv.get<FeaturedBundle>(kvKey(dateKey));
        return v ?? null;
    } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        throw new Error(`KV_ERROR: ${m}`);
    }
}

export async function saveFeaturedBundle(bundle: FeaturedBundle): Promise<void> {
    if (skipKv()) return;
    try {
        await kv.set(kvKey(bundle.dateKey), bundle, { ex: 60 * 60 * 72 });
    } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        throw new Error(`KV_ERROR: ${m}`);
    }
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
    try {
        await saveFeaturedBundle(bundle);
    } catch {
        /* 写入 KV 失败仍返回当日生成结果，避免前端 500；长期应修复 KV 或使用 READING_FEATURED_SKIP_KV 本地调试 */
    }
    return bundle;
}

export function currentDateKeyShanghai(): string {
    return getDateKeyShanghai();
}
