/**
 * 核心文章生成器：调用 DeepSeek 生成完整的英语学习文章。
 *
 * 从 v2 起改为"词典驱动"的两遍流程：
 *   1) DeepSeek 生成文章正文 + 摘要 + 测验（不再让 AI 自己挑词汇）
 *   2) 离线词典（Neon Postgres）基于正文打分选出重点词汇
 *   3) DeepSeek 给已选定的词写新例句 + 中文译文
 *
 * 当数据库未配置或词典返回空时，会优雅回退到"单遍（AI 自行挑词）"的旧流程，
 * 保证线上服务不会因基础设施缺失而整个挂掉。
 *
 * 供「今日精选」Cron 和「自选主题」即时端点共用。
 */

import { hasDictDb } from './db.js';
import {
    pickVocabularyFromArticle,
    type PickedVocabItem,
} from './article-vocab-pick.js';

export type AiDifficulty = 1 | 2 | 3 | 4 | 5;

export interface AiVocabItem {
    word: string;
    phonetic: string;
    pos: string;
    definitionZh: string;
    exampleSentence: string;
    /** 例句的中文翻译（v2 起由词典+二次调用提供） */
    exampleZh?: string;
    /** 展示标签，如 CET6 / B2 / GRE（v2 起由词典提供） */
    difficultyLabel?: string;
    /** 是否判定为专业术语（v2 起由词典提供） */
    isProfessional?: boolean;
}

export interface AiQuizItem {
    question: string;
    options: string[];
    answer: string;
    explanationZh: string;
}

export interface AiGeneratedArticle {
    title: string;
    body: string;
    difficulty: AiDifficulty;
    summary: string;
    keyVocabulary: AiVocabItem[];
    /** 3–5 固定短语/搭配，正文中逐字出现。可能为空数组（降级时）。 */
    keyPhrases: string[];
    quiz: AiQuizItem[];
}

/**
 * 难度对应的学习目标参数。
 *
 * 字数上限已下调一档（对应 2026-04 AI 生成速度优化）：
 * 过长的文章并不显著提升学习效率，反而把生成时间拉到 25 秒以上。
 */
const DIFFICULTY_PROFILES: Record<AiDifficulty, {
    cefr: string;
    wordRange: string;
    vocabConstraint: string;
    sentenceStyle: string;
}> = {
    1: {
        cefr: 'CEFR A1-A2',
        wordRange: '200-260',
        vocabConstraint: 'use only the most common 2000 English words',
        sentenceStyle: 'short simple sentences, mostly present tense',
    },
    2: {
        cefr: 'CEFR A2-B1',
        wordRange: '240-300',
        vocabConstraint: 'use the top 4000 most common words',
        sentenceStyle: 'mix simple and compound sentences, basic tenses',
    },
    3: {
        cefr: 'CEFR B1-B2',
        wordRange: '280-360',
        vocabConstraint: 'general adult reader vocabulary',
        sentenceStyle: 'varied sentence structures including some complex sentences',
    },
    4: {
        cefr: 'CEFR B2-C1',
        wordRange: '320-420',
        vocabConstraint: 'include academic and professional vocabulary naturally',
        sentenceStyle: 'sophisticated sentence structures, appropriate for editorials',
    },
    5: {
        cefr: 'CEFR C1-C2',
        wordRange: '380-480',
        vocabConstraint: 'unrestricted vocabulary including specialized terms',
        sentenceStyle: 'literary or journalistic prose with nuance and rhetorical variety',
    },
};

/* ========================================================================= */
/*                       Pass 1: 文章核心（无词汇）                           */
/* ========================================================================= */

interface ArticleCore {
    title: string;
    body: string;
    summary: string;
    quiz: AiQuizItem[];
    keyPhrases: string[];
}

function buildCorePrompt(topic: string, difficulty: AiDifficulty): { system: string; user: string } {
    const profile = DIFFICULTY_PROFILES[difficulty];
    const system = [
        'You are an experienced English-as-a-second-language content author.',
        'You write clean, engaging reading passages for Chinese learners of English.',
        'You output ONLY a single JSON object. No markdown fences, no prose before or after the JSON.',
        '',
        'The JSON schema MUST be exactly:',
        '{',
        '  "title": string,                  // English title, concise',
        '  "body": string,                   // English article body in Markdown. Use paragraphs. No headings beyond ## if needed.',
        '  "difficulty": number,             // Echo the requested difficulty (1-5)',
        '  "summary": string,                // One-sentence Chinese summary (不超过 40 字)',
        '  "keyPhrases": [string],           // 3-5 fixed phrases/collocations that appear verbatim in the body (preserve original casing)',
        '  "quiz": [                         // exactly 2 comprehension questions',
        '    {',
        '      "question": string,           // English question about the article',
        '      "options": [string, string, string, string],  // Exactly 4 options, no A/B/C/D prefix',
        '      "answer": string,             // "A", "B", "C", or "D"',
        '      "explanationZh": string       // Chinese explanation of the correct answer',
        '    }',
        '  ]',
        '}',
        '',
        'Rules:',
        '- Keep the body self-contained; do not reference external links or images.',
        '- Do not include the title inside the body.',
        '- Do not include A/B/C/D letter prefixes inside options strings.',
        '- DO NOT include any vocabulary list. Key vocabulary is selected separately by a dictionary pipeline.',
        '- Produce 3-5 keyPhrases. Each MUST appear verbatim (same casing) somewhere in the body.',
        '- keyPhrases MUST be multi-word collocations of 2-5 words each. Single-word entries will be rejected. Good: "climate change", "make up for", "on the verge of". Bad: "sustainability", "innovation", "foster".',
    ].join('\n');

    const user = [
        `Write a reading passage for English learners on the topic below.`,
        ``,
        `Topic: ${topic}`,
        ``,
        `Difficulty: ${difficulty} (${profile.cefr})`,
        `Word count: ${profile.wordRange} words`,
        `Vocabulary constraint: ${profile.vocabConstraint}`,
        `Sentence style: ${profile.sentenceStyle}`,
        ``,
        `Return the JSON object only, following the schema strictly.`,
    ].join('\n');

    return { system, user };
}

function parseCoreJson(raw: string): ArticleCore {
    const jsonText = extractJson(raw);
    const obj = JSON.parse(jsonText) as Record<string, unknown>;

    const title = asString(obj.title);
    const body = asString(obj.body);
    const summary = asString(obj.summary);
    if (!title) throw new Error('AI 返回缺少 title');
    if (!body) throw new Error('AI 返回缺少 body');

    const quizRaw = Array.isArray(obj.quiz) ? obj.quiz : [];
    const quiz: AiQuizItem[] = quizRaw
        .slice(0, 5)
        .map((v) => {
            const o = (v ?? {}) as Record<string, unknown>;
            const options = asStringArray(o.options, 4);
            const answer = asString(o.answer).toUpperCase();
            return {
                question: asString(o.question),
                options,
                answer: /^[A-D]$/.test(answer) ? answer : 'A',
                explanationZh:
                    asString(o.explanationZh) ||
                    asString(o.explanation_zh) ||
                    asString(o.explanation),
            };
        })
        .filter((q) => q.question && q.options.length === 4);

    const keyPhrases = sanitizeKeyPhrases(obj.keyPhrases, body);

    return { title, body, summary, quiz, keyPhrases };
}

/* ========================================================================= */
/*                     Pass 2: 给已选词生成例句                              */
/* ========================================================================= */

interface ExampleOut {
    word: string;
    exampleEn: string;
    exampleZh: string;
}

function buildExamplePrompt(picked: PickedVocabItem[], topic: string): {
    system: string;
    user: string;
} {
    const system = [
        'You are an English learning assistant.',
        'For each given word, write ONE new short English example sentence that a learner can understand at a glance, plus a faithful Chinese translation of that sentence.',
        'The sentence MUST be new and self-contained; DO NOT copy phrasing from the source article.',
        '',
        'Output ONE JSON object ONLY, no markdown fences:',
        '{',
        '  "vocab": [',
        '    { "word": string, "exampleEn": string, "exampleZh": string }',
        '  ]',
        '}',
        '',
        'Rules:',
        '- Preserve the input word list order and spelling.',
        '- English sentences 6-16 words each; everyday context unless the word itself is domain-specific.',
        '- Chinese translation concise and natural (不要逐字生硬翻译).',
    ].join('\n');

    const words = picked
        .map((p, i) => {
            const pos = p.entry.pos ? ` (${p.entry.pos})` : '';
            const zh = p.entry.translationZh ? ` — ${p.entry.translationZh.slice(0, 120)}` : '';
            return `${i + 1}. ${p.word}${pos}${zh}`;
        })
        .join('\n');

    const user = [
        `Article topic (for context only, do not quote it): ${topic || '(general)'}`,
        ``,
        `Word list:`,
        words,
        ``,
        `Return the JSON object only.`,
    ].join('\n');

    return { system, user };
}

function parseExampleJson(raw: string): ExampleOut[] {
    const jsonText = extractJson(raw);
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    const arr = Array.isArray(obj.vocab) ? obj.vocab : [];
    return arr
        .map((v) => {
            const o = (v ?? {}) as Record<string, unknown>;
            return {
                word: asString(o.word),
                exampleEn: asString(o.exampleEn) || asString(o.example_en),
                exampleZh: asString(o.exampleZh) || asString(o.example_zh),
            };
        })
        .filter((x) => x.word);
}

/* ========================================================================= */
/*                     兜底：旧版单遍（AI 自行挑词）                          */
/* ========================================================================= */

function buildLegacyPrompt(topic: string, difficulty: AiDifficulty): { system: string; user: string } {
    const profile = DIFFICULTY_PROFILES[difficulty];
    const system = [
        'You are an experienced English-as-a-second-language content author.',
        'You write clean, engaging reading passages for Chinese learners of English.',
        'You output ONLY a single JSON object. No markdown fences, no prose before or after the JSON.',
        '',
        'The JSON schema MUST be exactly:',
        '{',
        '  "title": string,',
        '  "body": string,',
        '  "difficulty": number,',
        '  "summary": string,',
        '  "keyPhrases": [string],',
        '  "keyVocabulary": [',
        '    { "word": string, "phonetic": string, "pos": string, "definitionZh": string, "exampleSentence": string, "exampleZh": string }',
        '  ],',
        '  "quiz": [',
        '    { "question": string, "options": [string,string,string,string], "answer": string, "explanationZh": string }',
        '  ]',
        '}',
        '',
        'Rules:',
        '- Produce exactly 5 keyVocabulary items; every word MUST appear verbatim in the body.',
        '- Produce 3-5 keyPhrases. Each MUST appear verbatim (same casing) somewhere in the body.',
        '- keyPhrases MUST be multi-word collocations of 2-5 words each. Single-word entries will be rejected. Good: "climate change", "make up for", "on the verge of". Bad: "sustainability", "innovation", "foster".',
        '- Produce exactly 2 quiz items.',
        '- Do not include A/B/C/D letter prefixes inside options strings.',
        '- Keep the body self-contained; no links or images.',
    ].join('\n');

    const user = [
        `Write a reading passage for English learners on the topic below.`,
        ``,
        `Topic: ${topic}`,
        ``,
        `Difficulty: ${difficulty} (${profile.cefr})`,
        `Word count: ${profile.wordRange} words`,
        `Vocabulary constraint: ${profile.vocabConstraint}`,
        `Sentence style: ${profile.sentenceStyle}`,
        ``,
        `Return the JSON object only.`,
    ].join('\n');
    return { system, user };
}

function parseLegacyJson(raw: string, difficulty: AiDifficulty): AiGeneratedArticle {
    const jsonText = extractJson(raw);
    const obj = JSON.parse(jsonText) as Record<string, unknown>;

    const title = asString(obj.title);
    const body = asString(obj.body);
    const summary = asString(obj.summary);
    if (!title) throw new Error('AI 返回缺少 title');
    if (!body) throw new Error('AI 返回缺少 body');

    const vocabRaw = Array.isArray(obj.keyVocabulary) ? obj.keyVocabulary : [];
    const keyVocabulary: AiVocabItem[] = vocabRaw
        .slice(0, 8)
        .map((v) => {
            const o = (v ?? {}) as Record<string, unknown>;
            return {
                word: asString(o.word),
                phonetic: asString(o.phonetic),
                pos: asString(o.pos),
                definitionZh:
                    asString(o.definitionZh) ||
                    asString(o.definition_zh) ||
                    asString(o.translation),
                exampleSentence:
                    asString(o.exampleSentence) ||
                    asString(o.example_sentence) ||
                    asString(o.example),
                exampleZh:
                    asString(o.exampleZh) ||
                    asString(o.example_zh) ||
                    undefined,
            };
        })
        .filter((v) => v.word && v.definitionZh);

    const quizRaw = Array.isArray(obj.quiz) ? obj.quiz : [];
    const quiz: AiQuizItem[] = quizRaw
        .slice(0, 5)
        .map((v) => {
            const o = (v ?? {}) as Record<string, unknown>;
            const options = asStringArray(o.options, 4);
            const answer = asString(o.answer).toUpperCase();
            return {
                question: asString(o.question),
                options,
                answer: /^[A-D]$/.test(answer) ? answer : 'A',
                explanationZh:
                    asString(o.explanationZh) ||
                    asString(o.explanation_zh) ||
                    asString(o.explanation),
            };
        })
        .filter((q) => q.question && q.options.length === 4);

    const keyPhrases = sanitizeKeyPhrases(obj.keyPhrases, body);

    return { title, body, difficulty, summary, keyVocabulary, keyPhrases, quiz };
}

/* ========================================================================= */
/*                              共用工具                                    */
/* ========================================================================= */

function extractJson(raw: string): string {
    let s = raw.trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence && fence[1]) s = fence[1].trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) return s.slice(start, end + 1);
    return s;
}

function asString(x: unknown): string {
    return typeof x === 'string' ? x.trim() : '';
}

function asStringArray(x: unknown, expectedLen?: number): string[] {
    if (!Array.isArray(x)) return [];
    const arr = x.map((v) => asString(v)).filter((s) => s.length > 0);
    if (expectedLen !== undefined && arr.length !== expectedLen) return [];
    return arr;
}

/**
 * Clean up a raw `keyPhrases` array from the LLM.
 *
 * Rules (enforced server-side regardless of what the model does):
 *  - Must be a non-empty string after trim.
 *  - Length 2..80 chars.
 *  - Must be a multi-word collocation (>= 2 whitespace-separated tokens).
 *    This is the whole point of keyPhrases — single words belong in keyVocabulary.
 *  - Must appear verbatim (case-insensitive) in the article body, so the
 *    client-side highlighter is guaranteed to find a match.
 *  - De-duplicated (case-insensitive), first occurrence wins.
 *  - Capped at 5 entries.
 */
function sanitizeKeyPhrases(raw: unknown, body: string): string[] {
    const input = Array.isArray(raw) ? raw : [];
    const lowerBody = body.toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of input) {
        const p = asString(item);
        if (!p) continue;
        if (p.length < 2 || p.length > 80) continue;
        // multi-word check: split on any whitespace, need at least 2 non-empty tokens
        const tokens = p.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) continue;
        if (!lowerBody.includes(p.toLowerCase())) continue;
        const k = p.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(p);
        if (out.length >= 5) break;
    }
    return out;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/** 单个 DeepSeek 请求的硬超时（毫秒）。避免个别慢请求拖垮精选生成 */
const DEEPSEEK_TIMEOUT_MS = 28_000;

async function callDeepSeek(
    system: string,
    user: string,
    apiKey: string,
    opts: { maxTokens: number; timeoutMs?: number }
): Promise<string> {
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let r: Response;
    try {
        r = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
                temperature: 0.7,
                max_tokens: opts.maxTokens,
                response_format: { type: 'json_object' },
            }),
            signal: controller.signal,
        });
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw new Error(`DeepSeek 请求超时 (${timeoutMs}ms)`);
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }

    if (!r.ok) {
        const t = await r.text();
        throw new Error(`DeepSeek ${r.status}: ${t.slice(0, 300)}`);
    }

    const data = (await r.json()) as {
        choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('DeepSeek 返回内容为空');
    return content;
}

/* ========================================================================= */
/*                              对外主入口                                  */
/* ========================================================================= */

/**
 * 核心入口：给定话题和难度，返回一篇完整的学习文章。
 *
 * 若词典已配置：两遍流程（正文→选词→例句）。
 * 若词典未配置 / 选词失败：回退到单遍（AI 自行挑词）。
 */
export async function generateLearningArticle(
    topic: string,
    difficulty: AiDifficulty,
    apiKey: string,
    options?: { timeoutMs?: number }
): Promise<AiGeneratedArticle> {
    const cleanTopic = topic.trim().slice(0, 200);
    if (!cleanTopic) throw new Error('EMPTY_TOPIC');

    const overallTimeout = options?.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;

    /** 有词典的话优先走两遍流程，单步失败自动回退 */
    if (hasDictDb()) {
        try {
            return await generateViaDict(cleanTopic, difficulty, apiKey, overallTimeout);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[reading-article-generate] dict pipeline failed, falling back: ${msg}`);
        }
    }

    return await generateLegacy(cleanTopic, difficulty, apiKey, overallTimeout);
}

async function generateViaDict(
    topic: string,
    difficulty: AiDifficulty,
    apiKey: string,
    budgetMs: number
): Promise<AiGeneratedArticle> {
    const corePrompt = buildCorePrompt(topic, difficulty);
    const coreRaw = await callDeepSeek(corePrompt.system, corePrompt.user, apiKey, {
        maxTokens: 1100,
        timeoutMs: Math.min(budgetMs, 22_000),
    });

    let core: ArticleCore;
    try {
        core = parseCoreJson(coreRaw);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`AI 文章解析失败: ${msg}`);
    }

    /** 词典选词：失败或空列表时抛错，由外层回退到 legacy */
    const picked = await pickVocabularyFromArticle({
        articleBody: core.body,
        difficulty,
        topic,
    });
    if (picked.length === 0) {
        throw new Error('词典选词为空');
    }

    /** 第二步：给已选词生成例句。失败就用空字符串兜底，不让整篇文章挂掉 */
    let examples: Map<string, ExampleOut> = new Map();
    try {
        const examplePrompt = buildExamplePrompt(picked, topic);
        const exampleRaw = await callDeepSeek(examplePrompt.system, examplePrompt.user, apiKey, {
            maxTokens: 700,
            timeoutMs: Math.min(budgetMs, 15_000),
        });
        for (const e of parseExampleJson(exampleRaw)) {
            examples.set(e.word.toLowerCase(), e);
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[reading-article-generate] example generation failed: ${msg}`);
    }

    const keyVocabulary: AiVocabItem[] = picked.map((p) => {
        const ex = examples.get(p.word.toLowerCase());
        return {
            word: p.word,
            phonetic: p.entry.phonetic || '',
            pos: p.entry.pos || '',
            definitionZh: p.entry.translationZh || '',
            exampleSentence: ex?.exampleEn || '',
            exampleZh: ex?.exampleZh || '',
            difficultyLabel: p.displayLabel,
            isProfessional: p.isProfessional,
        };
    });

    return {
        title: core.title,
        body: core.body,
        difficulty,
        summary: core.summary,
        keyVocabulary,
        keyPhrases: core.keyPhrases,
        quiz: core.quiz,
    };
}

async function generateLegacy(
    topic: string,
    difficulty: AiDifficulty,
    apiKey: string,
    budgetMs: number
): Promise<AiGeneratedArticle> {
    const { system, user } = buildLegacyPrompt(topic, difficulty);
    const content = await callDeepSeek(system, user, apiKey, {
        maxTokens: 1300,
        timeoutMs: Math.min(budgetMs, 28_000),
    });
    try {
        return parseLegacyJson(content, difficulty);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`AI 文章解析失败: ${msg}`);
    }
}
