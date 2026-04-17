import type { ReadingDifficulty } from '@/store/readingLibraryStore';
import { callAiProxy } from '@/lib/api-client';
import { lookupDictWord, type DictLookupEntry } from '@/lib/dict-lookup-api';

async function callProxy(payload: object): Promise<string> {
    const data = await callAiProxy(payload as Record<string, unknown>);
    return String((data as any)?.choices?.[0]?.message?.content ?? '').trim();
}

/** 根据标题+摘要估计 1–5 难度；失败时返回 3 */
export async function estimateReadingDifficulty(title: string, textPreview: string): Promise<ReadingDifficulty> {
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

/**
 * 对选中英文做语法结构分析（不是翻译！）
 *
 * 历史版本 prompt 过于宽泛，模型经常把"解释英文"误解成"翻译成中文"，
 * 现在用明确的维度清单 + 禁令 + 示例，强约束输出为语法结构剖析。
 */
export async function fetchReadingGrammarNotes(selectedEnglish: string): Promise<string> {
    const t = selectedEnglish.trim();
    if (!t) throw new Error('请先选中一段英文');
    if (t.length > 2000) throw new Error('选区过长，请缩短后再分析');
    return callProxy({
        messages: [
            {
                role: 'system',
                content: [
                    '你是面向中国英语学习者的语法分析师。用户选中了一段英文，你的任务是分析它的语法结构，让学习者看懂这段英文是怎么搭起来的——不是翻译它。',
                    '',
                    '严格约束：',
                    '1. 绝对不做中文翻译。页面已经有"翻译"按钮，用户想看译文会自己点。',
                    '2. 用中文分点分析，按需覆盖以下维度（不适用的略过）：',
                    '   - 句型：简单句 / 并列句 / 复合句；主谓宾核心是什么',
                    '   - 时态·语态：主要动词的时态和主被动',
                    '   - 关键语法结构：定语从句、状语从句、分词短语、不定式、倒装、强调、虚拟语气、省略等（专业术语括号里给英文名）',
                    '   - 难点提示：中国学习者最容易看不懂或翻译错的点是什么，一句话点明',
                    '3. 若选中的只是短语或单词，只说它的词性·作用·搭配，不展开造句分析。',
                    '4. 总长度不超过 220 字。',
                    '',
                    '示例输入：The book, which was published in 1920, remains influential today.',
                    '示例输出：',
                    '句型：复合句（complex sentence），主句是 The book remains influential today。',
                    '时态·语态：主句一般现在时主动；从句 was published 过去时被动。',
                    '关键结构：which 引导的非限定性定语从句（non-defining relative clause），用逗号隔开补充信息。',
                    '难点：非限定性定语从句只是附加说明，去掉仍是完整句；和"限定性"相比不影响中心意义。',
                ].join('\n'),
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
    /** 数据来源（v2 起）：'dict' 含词典高权威字段，'ai' 纯 AI 生成，'mixed' 两者融合 */
    source?: 'dict' | 'ai' | 'mixed';
    /** 展示标签：'CET6' / 'B2' / 'GRE' 等（v2 起词典命中时才有） */
    difficultyLabel?: string;
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

/** 从词典条目生成 UI 展示标签 */
function dictDisplayLabel(e: DictLookupEntry): string {
    const tag = (e.tag || '').toLowerCase();
    if (tag.includes('gre')) return 'GRE';
    if (tag.includes('toefl')) return 'TOEFL';
    if (tag.includes('ielts')) return 'IELTS';
    if (tag.includes('ky')) return '考研';
    if (tag.includes('cet6')) return 'CET6';
    if (tag.includes('cet4')) return 'CET4';
    if (tag.includes('gk')) return '高考';
    if (tag.includes('zk')) return '中考';
    if (e.cefr) return e.cefr;
    return `L${e.difficultyLevel}`;
}

async function callAiForWordCard(word: string, ctx: string): Promise<ReadingWordCardData> {
    const raw = await callProxy({
        messages: [
            {
                role: 'system',
                content:
                    'You help English learners. Reply with ONE JSON object only, no markdown, no code fences, no extra keys. Keys: phonetic (IPA-like string, may be empty), pos (part of speech in English, short), definitionZh (Chinese gloss), exampleEn (one short English example using the word), exampleZh (Chinese for that example).',
            },
            {
                role: 'user',
                content: `Word: ${word}\nContext (may be truncated):\n${ctx || '(none)'}`,
            },
        ],
        max_tokens: 500,
        temperature: 0.3,
    });
    return parseReadingWordCardJson(raw);
}

/**
 * 阅读划词：视觉词典主入口。
 *
 * v2 策略（词典驱动）：
 *   1) 同时发起"词典查词"和"AI 例句卡片"两个请求，不增加总延迟；
 *   2) 若词典命中：用词典的 phonetic / pos / 中文释义（更权威），AI 的 exampleEn/exampleZh；
 *   3) 若词典未命中但 AI 成功：完全走 AI 结果（老行为）；
 *   4) 若两者都失败：抛错。
 *
 * 词典未配置、网络错误等都会被 lookupDictWord 吞掉返回 null，用户体验无感。
 */
export async function fetchReadingWordCard(
    word: string,
    contextSnippet: string
): Promise<ReadingWordCardData> {
    const w = word.trim();
    if (!w) throw new Error('单词为空');
    const ctx = contextSnippet.trim().slice(0, 500);

    const [dictRes, aiRes] = await Promise.allSettled([
        lookupDictWord(w),
        callAiForWordCard(w, ctx),
    ]);
    const dict = dictRes.status === 'fulfilled' ? dictRes.value : null;
    const ai =
        aiRes.status === 'fulfilled'
            ? aiRes.value
            : (null as ReadingWordCardData | null);

    if (dict) {
        const label = dictDisplayLabel(dict);
        if (ai) {
            return {
                phonetic: dict.phonetic || ai.phonetic,
                pos: dict.pos || ai.pos,
                definitionZh: dict.translationZh || ai.definitionZh,
                exampleEn: ai.exampleEn,
                exampleZh: ai.exampleZh,
                source: 'mixed',
                difficultyLabel: label,
            };
        }
        return {
            phonetic: dict.phonetic || '',
            pos: dict.pos || '',
            definitionZh: dict.translationZh || '',
            exampleEn: '',
            exampleZh: '',
            source: 'dict',
            difficultyLabel: label,
        };
    }

    if (ai) {
        return { ...ai, source: 'ai' };
    }

    throw new Error('查词结果解析失败，请重试');
}
