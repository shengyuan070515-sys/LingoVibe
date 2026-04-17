import { kv } from '@vercel/kv';
import { getDateKeyShanghai } from '../../src/lib/date-key-shanghai.js';
import { generateFeaturedBundle, type FeaturedBundle } from './reading-featured-generate.js';

function kvKey(dateKey: string): string {
    /** v2 = AI 生成文章（新 schema），与旧链接型缓存隔离 */
    return `reading:featured:v2:${dateKey}`;
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

/** 读缓存；若无则调用 DeepSeek 生成并写入（与 Cron 共用逻辑） */
export async function ensureFeaturedForDate(dateKey: string): Promise<FeaturedBundle> {
    const cached = await loadFeaturedBundle(dateKey);
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
        return cached;
    }

    const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!deepseekKey) {
        throw new Error('MISSING_DEEPSEEK');
    }

    const tavilyKey = process.env.TAVILY_API_KEY?.trim() || undefined;

    /**
     * 部分写入：每完成一篇就落 KV 一次。
     * 即使 Vercel 在 60 秒后 kill 函数，已完成的文章也能被下一次请求读到，
     * 避免「用户每次点进来都重新跑 30 秒」的无限循环。
     */
    const onProgress = async (partial: FeaturedBundle) => {
        if (partial.items.length > 0) {
            try {
                await saveFeaturedBundle(partial);
            } catch {
                /* KV 写入失败时忽略 */
            }
        }
    };

    const bundle = await generateFeaturedBundle(dateKey, deepseekKey, tavilyKey, onProgress);
    if (bundle.items.length === 0) {
        throw new Error('GENERATION_FAILED');
    }
    try {
        await saveFeaturedBundle(bundle);
    } catch {
        /* 写入 KV 失败仍返回当日生成结果 */
    }
    return bundle;
}

export function currentDateKeyShanghai(): string {
    return getDateKeyShanghai();
}
