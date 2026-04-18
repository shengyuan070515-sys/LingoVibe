/** 服务端 GET /api/reading-featured-daily 返回体（v2：AI 生成文章） */

import type { ReadingQuizItem, ReadingVocabItem } from '@/store/readingLibraryStore';

export type FeaturedBundleItem = {
    id: string;
    title: string;
    body: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    summary: string;
    keyVocabulary: ReadingVocabItem[];
    keyPhrases?: string[];
    quiz: ReadingQuizItem[];
    topic: string;
    source: 'hot' | 'pool';
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
