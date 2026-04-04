/** 服务端 GET /api/reading-featured-daily 返回体（与 api 一致） */

export type FeaturedBundleItem = {
    categoryId: string;
    categoryLabelZh: string;
    url: string;
    title: string;
    snippet: string;
};

export type FeaturedBundle = {
    dateKey: string;
    generatedAt: number;
    version: number;
    items: FeaturedBundleItem[];
};

function apiBase(): string {
    return (import.meta.env.VITE_READING_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ?? '';
}

export async function fetchFeaturedDaily(dateKey?: string): Promise<FeaturedBundle> {
    const base = apiBase();
    if (!base) {
        throw new Error('未配置 VITE_READING_API_BASE');
    }
    const q = dateKey ? `?date=${encodeURIComponent(dateKey)}` : '';
    const r = await fetch(`${base}/api/reading-featured-daily${q}`);
    if (!r.ok) {
        let msg = `精选加载失败 ${r.status}`;
        try {
            const j = (await r.json()) as { error?: string; detail?: string };
            msg = j.detail || j.error || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    return (await r.json()) as FeaturedBundle;
}
