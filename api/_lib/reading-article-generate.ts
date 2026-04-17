/**
 * 核心文章生成器：调用 DeepSeek 生成完整的英语学习文章。
 *
 * 输出严格的 JSON 结构，包含：
 *   - 英文正文（Markdown）
 *   - 中文一句话摘要
 *   - 5-8 个重点词汇
 *   - 2-3 道理解题
 *
 * 供「今日精选」Cron 和「自选主题」即时端点共用。
 */

export type AiDifficulty = 1 | 2 | 3 | 4 | 5;

export interface AiVocabItem {
    word: string;
    phonetic: string;
    pos: string;
    definitionZh: string;
    exampleSentence: string;
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
    quiz: AiQuizItem[];
}

/** 难度对应的学习目标参数 */
const DIFFICULTY_PROFILES: Record<AiDifficulty, {
    cefr: string;
    wordRange: string;
    vocabConstraint: string;
    sentenceStyle: string;
}> = {
    1: {
        cefr: 'CEFR A1-A2',
        wordRange: '300-400',
        vocabConstraint: 'use only the most common 2000 English words',
        sentenceStyle: 'short simple sentences, mostly present tense',
    },
    2: {
        cefr: 'CEFR A2-B1',
        wordRange: '350-450',
        vocabConstraint: 'use the top 4000 most common words',
        sentenceStyle: 'mix simple and compound sentences, basic tenses',
    },
    3: {
        cefr: 'CEFR B1-B2',
        wordRange: '400-550',
        vocabConstraint: 'general adult reader vocabulary',
        sentenceStyle: 'varied sentence structures including some complex sentences',
    },
    4: {
        cefr: 'CEFR B2-C1',
        wordRange: '500-650',
        vocabConstraint: 'include academic and professional vocabulary naturally',
        sentenceStyle: 'sophisticated sentence structures, appropriate for editorials',
    },
    5: {
        cefr: 'CEFR C1-C2',
        wordRange: '600-800',
        vocabConstraint: 'unrestricted vocabulary including specialized terms',
        sentenceStyle: 'literary or journalistic prose with nuance and rhetorical variety',
    },
};

function buildPrompt(topic: string, difficulty: AiDifficulty): { system: string; user: string } {
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
        '  "keyVocabulary": [                // 5 to 8 items',
        '    {',
        '      "word": string,               // Single English word or short phrase from the body',
        '      "phonetic": string,           // IPA in slashes, e.g. "/ˈsɛrənˌdɪpəti/"',
        '      "pos": string,                // Part of speech: "n.", "v.", "adj.", "adv.", etc.',
        '      "definitionZh": string,       // Chinese definition, concise',
        '      "exampleSentence": string     // One short English example using the word',
        '    }',
        '  ],',
        '  "quiz": [                         // 2 or 3 comprehension questions',
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
        '- Every keyVocabulary word MUST appear verbatim in the body.',
        '- Keep the body self-contained; do not reference external links or images.',
        '- Do not include the title inside the body.',
        '- Do not include A/B/C/D letter prefixes inside options strings.',
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

function parseArticleJson(raw: string, difficulty: AiDifficulty): AiGeneratedArticle {
    const jsonText = extractJson(raw);
    const obj = JSON.parse(jsonText) as Record<string, unknown>;

    const title = asString(obj.title);
    const body = asString(obj.body);
    const summary = asString(obj.summary);

    if (!title) throw new Error('AI 返回缺少 title');
    if (!body) throw new Error('AI 返回缺少 body');

    const vocabRaw = Array.isArray(obj.keyVocabulary) ? obj.keyVocabulary : [];
    const keyVocabulary: AiVocabItem[] = vocabRaw
        .slice(0, 10)
        .map((v) => {
            const o = (v ?? {}) as Record<string, unknown>;
            return {
                word: asString(o.word),
                phonetic: asString(o.phonetic),
                pos: asString(o.pos),
                definitionZh: asString(o.definitionZh) || asString(o.definition_zh) || asString(o.translation),
                exampleSentence: asString(o.exampleSentence) || asString(o.example_sentence) || asString(o.example),
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
                explanationZh: asString(o.explanationZh) || asString(o.explanation_zh) || asString(o.explanation),
            };
        })
        .filter((q) => q.question && q.options.length === 4);

    return {
        title,
        body,
        difficulty,
        summary,
        keyVocabulary,
        quiz,
    };
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/** 单个 DeepSeek 请求的硬超时（毫秒）。避免个别慢请求拖垮精选生成 */
const DEEPSEEK_TIMEOUT_MS = 28_000;

/**
 * 核心入口：给定话题和难度，返回一篇完整的学习文章。
 * 抛出异常时由调用方决定是否重试 / 回退。
 *
 * @param options.timeoutMs 单请求超时，默认 28 秒
 */
export async function generateLearningArticle(
    topic: string,
    difficulty: AiDifficulty,
    apiKey: string,
    options?: { timeoutMs?: number }
): Promise<AiGeneratedArticle> {
    const cleanTopic = topic.trim().slice(0, 200);
    if (!cleanTopic) throw new Error('EMPTY_TOPIC');

    const { system, user } = buildPrompt(cleanTopic, difficulty);

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;
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
                max_tokens: 1800,
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

    try {
        return parseArticleJson(content, difficulty);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`AI 文章解析失败: ${msg}`);
    }
}
