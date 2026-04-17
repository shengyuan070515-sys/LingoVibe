import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { canonicalizeUrl } from '@/lib/reading-url';

export type ReadingDifficulty = 1 | 2 | 3 | 4 | 5;
export type ReadingSourceType = 'web_curated' | 'user_import' | 'ai_generated';

export interface ReadingVocabItem {
    word: string;
    phonetic: string;
    pos: string;
    definitionZh: string;
    exampleSentence: string;
}

export interface ReadingQuizItem {
    question: string;
    options: string[];
    answer: string;
    explanationZh: string;
}

export interface ReadingArticle {
    id: string;
    canonicalUrl: string | null;
    sourceTitle: string;
    content: string;
    fetchedAt: number;
    difficulty: ReadingDifficulty;
    sourceType: ReadingSourceType;
    /** 正文抽取失败（如付费墙）：仅展示摘要 + 官网按钮 */
    summaryOnly?: boolean;
    summaryText?: string;
    /** AI 生成文章专属：一句话中文摘要 */
    summary?: string;
    /** AI 生成文章专属：重点词汇（5-8 个） */
    keyVocabulary?: ReadingVocabItem[];
    /** AI 生成文章专属：随文测验（2-3 题） */
    quiz?: ReadingQuizItem[];
    /** AI 生成文章专属：话题标签 */
    topic?: string;
    /**
     * 是否已被用户主动加入"我的书库"。
     * - 今日精选点击阅读：false（仅作为阅读缓存，不计入书库）
     * - 自选主题即时生成：false（同上，需用户手动加入）
     * - 用户本地导入（.txt / 粘贴）：true（显式入库）
     * - 外刊原文勾选入库：true（显式入库）
     * 缺省视为 true（向后兼容，旧用户的历史文章默认留在书库）。
     */
    addedToLibrary?: boolean;
    /**
     * AI 生成文章：是否由用户在「自选主题」中生成。
     * 用于「最近生成」卡片列表过滤，与今日精选缓存区分。
     */
    isUserGenerated?: boolean;
}

/** 判断一篇文章是否属于"我的书库"（缺省视为 true 以保持与旧数据兼容）。 */
export function isInLibrary(a: ReadingArticle): boolean {
    return a.addedToLibrary !== false;
}

export type AddOrGetByUrlResult =
    | { ok: true; id: string; duplicate: boolean }
    | { ok: false; reason: 'invalid_url' | 'empty_content' };

interface ReadingLibraryState {
    articles: ReadingArticle[];
    addOrGetByUrl: (input: {
        url: string;
        title: string;
        content: string;
        difficulty: ReadingDifficulty;
        summaryOnly?: boolean;
        summaryText?: string;
        /** 默认 true（联网勾选入库属于主动行为） */
        addedToLibrary?: boolean;
    }) => AddOrGetByUrlResult;
    addUserImport: (input: {
        title: string;
        content: string;
        difficulty?: ReadingDifficulty;
    }) => string;
    addAiArticle: (input: {
        title: string;
        content: string;
        difficulty: ReadingDifficulty;
        summary?: string;
        keyVocabulary?: ReadingVocabItem[];
        quiz?: ReadingQuizItem[];
        topic?: string;
        /** 默认 false（AI 生成/精选默认不入库，用户需要手动加） */
        addedToLibrary?: boolean;
        /** 用户主动生成为 true；今日精选缓存为 false */
        isUserGenerated?: boolean;
    }) => string;
    updateDifficulty: (id: string, difficulty: ReadingDifficulty) => void;
    /** 将指定文章标记为已/未加入"我的书库" */
    setAddedToLibrary: (id: string, added: boolean) => void;
    remove: (id: string) => void;
    getById: (id: string) => ReadingArticle | undefined;
}

function newReadingArticleId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `reading-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const useReadingLibraryStore = create<ReadingLibraryState>()(
    persist(
        (set, get) => ({
            articles: [],
            addOrGetByUrl: (input) => {
                const canonical = canonicalizeUrl(input.url);
                if (canonical === null) {
                    return { ok: false, reason: 'invalid_url' };
                }
                const summaryOnly = input.summaryOnly === true;
                if (!summaryOnly && !input.content.trim()) {
                    return { ok: false, reason: 'empty_content' };
                }
                const existing = get().articles.find((a) => a.canonicalUrl === canonical);
                if (existing) {
                    return { ok: true, id: existing.id, duplicate: true };
                }
                const id = newReadingArticleId();
                const article: ReadingArticle = {
                    id,
                    canonicalUrl: canonical,
                    sourceTitle: input.title,
                    content: input.content,
                    fetchedAt: Date.now(),
                    difficulty: input.difficulty,
                    sourceType: 'web_curated',
                    summaryOnly: summaryOnly || undefined,
                    summaryText: input.summaryText?.trim() || undefined,
                    addedToLibrary: input.addedToLibrary ?? true,
                };
                set((state) => ({ articles: [...state.articles, article] }));
                return { ok: true, id, duplicate: false };
            },
            addUserImport: (input) => {
                const id = newReadingArticleId();
                const article: ReadingArticle = {
                    id,
                    canonicalUrl: null,
                    sourceTitle: input.title,
                    content: input.content,
                    fetchedAt: Date.now(),
                    difficulty: input.difficulty ?? 3,
                    sourceType: 'user_import',
                    addedToLibrary: true,
                };
                set((state) => ({ articles: [...state.articles, article] }));
                return id;
            },
            addAiArticle: (input) => {
                const id = newReadingArticleId();
                const article: ReadingArticle = {
                    id,
                    canonicalUrl: null,
                    sourceTitle: input.title,
                    content: input.content,
                    fetchedAt: Date.now(),
                    difficulty: input.difficulty,
                    sourceType: 'ai_generated',
                    summary: input.summary,
                    keyVocabulary: input.keyVocabulary,
                    quiz: input.quiz,
                    topic: input.topic,
                    addedToLibrary: input.addedToLibrary ?? false,
                    isUserGenerated: input.isUserGenerated ?? false,
                };
                set((state) => ({ articles: [...state.articles, article] }));
                return id;
            },
            updateDifficulty: (id, difficulty) =>
                set((state) => ({
                    articles: state.articles.map((a) => (a.id === id ? { ...a, difficulty } : a)),
                })),
            setAddedToLibrary: (id, added) =>
                set((state) => ({
                    articles: state.articles.map((a) =>
                        a.id === id ? { ...a, addedToLibrary: added } : a
                    ),
                })),
            remove: (id) =>
                set((state) => ({
                    articles: state.articles.filter((a) => a.id !== id),
                })),
            getById: (id) => get().articles.find((a) => a.id === id),
        }),
        {
            name: 'lingovibe_reading_library',
            version: 3,
            migrate: (persisted, fromVersion) => {
                const state = persisted as { articles?: ReadingArticle[] } | undefined;
                if (!state?.articles) return persisted;
                if (fromVersion < 3) {
                    /**
                     * v2 → v3：历史文章全部默认标记为「已在书库」，避免升级后旧用户书库一下子变空。
                     * 之后新增的今日精选 / AI 生成文章会按新规则走（addedToLibrary=false）。
                     */
                    state.articles = state.articles.map((a) => ({
                        ...a,
                        addedToLibrary: a.addedToLibrary ?? true,
                    }));
                }
                return persisted;
            },
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                articles: state.articles.slice(-50).map((a) => ({
                    ...a,
                    content: a.content.slice(0, 80_000),
                })),
            }),
        },
    ),
);
