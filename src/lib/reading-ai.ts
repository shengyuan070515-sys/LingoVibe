import type { ReadingDifficulty } from '@/store/readingLibraryStore';
import { callAiProxy } from '@/lib/api-client';

async function callProxy(payload: object): Promise<string> {
    const data = await callAiProxy(payload as Record<string, unknown>);
    return String((data as any)?.choices?.[0]?.message?.content ?? '').trim();
}

/** 根据标题+摘要估计 1–5 难度；失败时返回 3 */
export async function estimateReadingDifficulty(_apiKey: string, title: string, textPreview: string): Promise<ReadingDifficulty> {
    const preview = textPreview.slice(0, 1200);
    const raw = await callProxy({
        messages: [
            {
                role: 'system',
                content: 'You classify English reading difficulty for learners. Reply with exactly one digit from 1 to 5 only. 1=easiest, 5=hardest. No other characters.',
            },
            {
                role: 'user',
                content: `Title: ${title}\n\nSample:\n${preview}`,
            },
        ],
        max_tokens: 8,
        temperature: 0.3,
    });
    const n = parseInt(raw.replace(/\D/g, '').slice(0, 1), 10);
    if (n >= 1 && n <= 5) return n as ReadingDifficulty;
    return 3;
}

/** 对选中英文做简短语法讲解（中文） */
export async function fetchReadingGrammarNotes(_apiKey: string, selectedEnglish: string): Promise<string> {
    const t = selectedEnglish.trim();
    if (!t) throw new Error('请先选中一段英文');
    if (t.length > 2000) throw new Error('选区过长，请缩短后再分析');
    return callProxy({
        messages: [
            {
                role: 'system',
                content: '你是英语语法助手。用简洁中文解释用户选中的英文片段：要点、关键结构、若有问题请温和指出。不要输出英文整段重复，控制在约 200 字内。',
            },
            { role: 'user', content: t },
        ],
        max_tokens: 500,
        temperature: 0.3,
    });
}

export type ReadingWordCardData = {
    phonetic: string;
    pos: string;
    definitionZh: string;
    exampleEn: string;
    exampleZh: string;
};

function parseReadingWordCardJson(raw: string): ReadingWordCardData {
    let s = raw.trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence) s = fence[1].trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    const obj = JSON.parse(s) as Record<string, unknown>;
    const asStr = (k: string) => (typeof obj[k] === 'string' ? (obj[k] as string).trim() : '');
    return {
        phonetic: asStr('phonetic'),
        pos: asStr('pos'),
        definitionZh: asStr('definitionZh') || asStr('definition_zh') || asStr('translation'),
        exampleEn: asStr('exampleEn') || asStr('example_en'),
        exampleZh: asStr('exampleZh') || asStr('example_zh'),
    };
}

/** 阅读划词：单次 LLM 调用返回结构化「视觉词典」字段 */
export async function fetchReadingWordCard(
    _apiKey: string,
    word: string,
    contextSnippet: string
): Promise<ReadingWordCardData> {
    const w = word.trim();
    if (!w) throw new Error('单词为空');
    const ctx = contextSnippet.trim().slice(0, 500);
    const raw = await callProxy({
        messages: [
            {
                role: 'system',
                content: 'You help English learners. Reply with ONE JSON object only, no markdown, no code fences, no extra keys. Keys: phonetic (IPA-like string, may be empty), pos (part of speech in English, short), definitionZh (Chinese gloss), exampleEn (one short English example using the word), exampleZh (Chinese for that example).',
            },
            {
                role: 'user',
                content: `Word: ${w}\nContext (may be truncated):\n${ctx || '(none)'}`,
            },
        ],
        max_tokens: 500,
        temperature: 0.3,
    });
    try {
        return parseReadingWordCardJson(raw);
    } catch {
        throw new Error('查词结果解析失败，请重试');
    }
}
