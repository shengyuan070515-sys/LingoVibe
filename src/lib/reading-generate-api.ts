/**
 * 前端调用 POST /api/reading-generate，即时生成 AI 学习文章。
 *
 * 服务端以 Server-Sent Events 流式返回：
 *   data: { type: "progress", total: <已累计的 JSON 字符数> }
 *   data: { type: "done", article: {...} }
 *   data: { type: "error", message: "..." }
 *
 * 前端据此展示真实进度条，避免盲等 15-30 秒。
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

/**
 * 生成完整 JSON 的典型字符数（经验值，用于估算进度条分母）。
 * 实际大约 2500-4500，取中间值做软性归一，不够精确但比转圈圈强得多。
 */
export const GENERATE_EXPECTED_TOTAL_CHARS = 3500;

function apiBase(): string {
    return (import.meta.env.VITE_READING_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ?? '';
}

export interface GenerateOptions {
    topic: string;
    difficulty: ReadingDifficulty;
    /** 进度回调：收到每个 chunk 时触发，`total` 是累计字符数 */
    onProgress?: (total: number) => void;
    signal?: AbortSignal;
}

type SseEvent =
    | { type: 'progress'; total: number }
    | { type: 'done'; topic: string; article: GeneratedArticle }
    | { type: 'error'; message: string };

export async function generateReadingArticle(input: GenerateOptions): Promise<GenerateResponse> {
    const base = apiBase();
    if (!base) {
        throw new Error('未配置 VITE_READING_API_BASE');
    }
    const r = await fetch(`${base}/api/reading-generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        },
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

    if (!r.body) {
        throw new Error('服务端未返回流式响应体');
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalArticle: GeneratedArticle | null = null;
    let finalTopic = input.topic;

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            /** SSE 帧以空行（\n\n 或 \r\n\r\n）分隔 */
            let sepIdx: number;
            while ((sepIdx = findFrameBoundary(buffer)) >= 0) {
                const frame = buffer.slice(0, sepIdx);
                buffer = buffer.slice(sepIdx).replace(/^(\r?\n){2}/, '');

                for (const line of frame.split(/\r?\n/)) {
                    if (!line.startsWith('data:')) continue;
                    const payload = line.slice(5).trim();
                    if (!payload) continue;
                    let evt: SseEvent;
                    try {
                        evt = JSON.parse(payload) as SseEvent;
                    } catch {
                        continue;
                    }
                    if (evt.type === 'progress') {
                        input.onProgress?.(evt.total);
                    } else if (evt.type === 'done') {
                        finalArticle = evt.article;
                        finalTopic = evt.topic;
                    } else if (evt.type === 'error') {
                        throw new Error(evt.message);
                    }
                }
            }
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            /* ignore */
        }
    }

    if (!finalArticle) {
        throw new Error('服务端未返回完整文章');
    }

    return { ok: true, topic: finalTopic, article: finalArticle };
}

/** 返回第一个帧分隔符（\n\n 或 \r\n\r\n）在 buf 中的位置，找不到返回 -1 */
function findFrameBoundary(buf: string): number {
    const a = buf.indexOf('\n\n');
    const b = buf.indexOf('\r\n\r\n');
    if (a < 0) return b;
    if (b < 0) return a;
    return Math.min(a, b);
}
