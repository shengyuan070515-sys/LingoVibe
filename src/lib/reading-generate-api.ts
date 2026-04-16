/**
 * 前端调用 POST /api/reading-generate，即时生成 AI 学习文章。
 */

import type { ReadingDifficulty, ReadingQuizItem, ReadingVocabItem } from '@/store/readingLibraryStore';

export type GeneratedArticle = {
    title: string;
    body: string;
    difficulty: ReadingDifficulty;
    summary: string;
    keyVocabulary: ReadingVocabItem[];
    quiz: ReadingQuizItem[];
};

export type GenerateResponse = {
    ok: true;
    topic: string;
    article: GeneratedArticle;
};

function apiBase(): string {
    return (import.meta.env.VITE_READING_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ?? '';
}

export async function generateReadingArticle(input: {
    topic: string;
    difficulty: ReadingDifficulty;
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
