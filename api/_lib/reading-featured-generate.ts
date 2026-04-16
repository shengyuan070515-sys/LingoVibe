/**
 * 每日精选：4 篇 Tavily 热点话题 + 4 篇固定主题池 → 逐篇调 DeepSeek 生成完整学习文章。
 * 与 Cron 共用。
 */

import { generateLearningArticle, type AiDifficulty, type AiGeneratedArticle } from './reading-article-generate.js';
import { searchTavily } from './tavily-search.js';

export type FeaturedArticleItem = AiGeneratedArticle & {
    id: string;
    /** 话题来源标识 */
    topic: string;
    /** 'hot' = Tavily 热点, 'pool' = 固定主题池 */
    source: 'hot' | 'pool';
};

export type FeaturedBundle = {
    dateKey: string;
    generatedAt: number;
    version: number;
    items: FeaturedArticleItem[];
};

/** 固定主题池，覆盖常见英语学习兴趣点 */
const FIXED_TOPIC_POOL: { topic: string; difficulty: AiDifficulty }[] = [
    { topic: 'How sleep affects memory and learning', difficulty: 2 },
    { topic: 'The psychology of habit formation', difficulty: 3 },
    { topic: 'A short history of coffee and global trade', difficulty: 3 },
    { topic: 'Understanding emotional intelligence at work', difficulty: 4 },
    { topic: 'The science of why music moves us', difficulty: 3 },
    { topic: 'Cities designed for walking, not driving', difficulty: 4 },
    { topic: 'How languages shape the way we think', difficulty: 4 },
    { topic: 'Simple ways to build a reading habit', difficulty: 2 },
    { topic: 'The hidden costs of fast fashion', difficulty: 3 },
    { topic: 'Why deep work matters in a distracted age', difficulty: 4 },
    { topic: 'The art of asking better questions', difficulty: 3 },
    { topic: 'What makes a story memorable', difficulty: 3 },
] as const;

/** Tavily 热点话题的搜索查询，每日轮换 */
const HOT_TOPIC_QUERIES = [
    'technology news this week',
    'climate and environment headlines',
    'business and economy trends',
    'science discoveries recent',
    'global culture news',
    'health and wellness insights',
    'space exploration latest',
    'education and learning trends',
] as const;

function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
    const out = [...arr];
    let h = hashString(seed);
    for (let i = out.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) & 0x7fffffff;
        const j = h % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function articleId(dateKey: string, index: number): string {
    return `featured-${dateKey}-${index}`;
}

/** 从 Tavily 搜索结果提炼一个可用于 AI 生成的短话题描述 */
async function deriveHotTopic(query: string, tavilyKey: string): Promise<string | null> {
    try {
        const hits = await searchTavily(query, tavilyKey, 3);
        if (hits.length === 0) return null;
        const top = hits[0];
        const title = (top.title || '').trim();
        const snippet = (top.snippet || '').trim().slice(0, 200);
        if (!title) return null;
        if (snippet) return `${title}. Context: ${snippet}`;
        return title;
    } catch {
        return null;
    }
}

/**
 * 生成当日精选 bundle。
 * 即便某些文章生成失败（网络/配额问题），也会返回已成功的部分。
 */
export async function generateFeaturedBundle(
    dateKey: string,
    deepseekKey: string,
    tavilyKey: string | undefined
): Promise<FeaturedBundle> {
    const items: FeaturedArticleItem[] = [];

    const hotQueries = seededShuffle(HOT_TOPIC_QUERIES, `${dateKey}:hot`).slice(0, 4);
    const poolTopics = seededShuffle(FIXED_TOPIC_POOL, `${dateKey}:pool`).slice(0, 4);

    let idx = 0;

    if (tavilyKey) {
        for (const q of hotQueries) {
            const topic = await deriveHotTopic(q, tavilyKey);
            if (!topic) continue;
            const difficulty: AiDifficulty = ((idx % 3) + 2) as AiDifficulty;
            try {
                const article = await generateLearningArticle(topic, difficulty, deepseekKey);
                items.push({
                    ...article,
                    id: articleId(dateKey, idx),
                    topic,
                    source: 'hot',
                });
                idx++;
            } catch {
                continue;
            }
        }
    }

    for (const { topic, difficulty } of poolTopics) {
        try {
            const article = await generateLearningArticle(topic, difficulty, deepseekKey);
            items.push({
                ...article,
                id: articleId(dateKey, idx),
                topic,
                source: 'pool',
            });
            idx++;
        } catch {
            continue;
        }
    }

    return {
        dateKey,
        generatedAt: Date.now(),
        version: 2,
        items,
    };
}
