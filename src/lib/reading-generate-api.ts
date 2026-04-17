/**
 * 前端调用 POST /api/reading-generate，即时生成 AI 学习文章。
 *
 * 服务端返回一次性 JSON。进度可视化由调用方自行基于时间驱动
 * （见 DailyReading.tsx 的 GenerationProgress 组件），不依赖服务端流。
 */

import type { ReadingDifficulty, ReadingQuizItem, ReadingVocabItem } from '@/store/readingLibraryStore';

export type GeneratedArticle = {
    title: string;
    body: string;
    difficulty: ReadingDifficulty;
    summary: string;
    keyVocabulary: ReadingVocabItem[];
    /** 3–5 固定搭配；老响应没有此字段 → 默认空数组 */
    keyPhrases?: string[];
    quiz: ReadingQuizItem[];
};

export type GenerateResponse = {
    ok: true;
    topic: string;
    article: GeneratedArticle;
};

/**
 * 生成一篇文章预计耗时（毫秒）。用于前端时间进度条软上限。
 * 经调优后实际值约 8-15 秒，这里取稍高的 15 秒作为 95% 阈值。
 */
export const GENERATE_EXPECTED_MS = 15_000;

function apiBase(): string {
    return (import.meta.env.VITE_READING_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ?? '';
}

export async function generateReadingArticle(input: {
    topic: string;
    difficulty: ReadingDifficulty;
    signal?: AbortSignal;
}): Promise<GenerateResponse> {
    const base = apiBase();
    if (!base) {
        throw new Error('未配置 VITE_READING_API_BASE');
    }
    const r = await fetch(`${base}/api/reading-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            topic: input.topic,
            difficulty: input.difficulty,
        }),
        signal: input.signal,
    });
    if (!r.ok) {
        let msg = `生成失败 ${r.status}`;
        try {
            const j = (await r.json()) as { error?: string; detail?: string };
            msg = j.detail || j.error || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    return (await r.json()) as GenerateResponse;
}
