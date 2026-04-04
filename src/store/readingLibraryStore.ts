import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { canonicalizeUrl } from '@/lib/reading-url';

export type ReadingDifficulty = 1 | 2 | 3 | 4 | 5;
export type ReadingSourceType = 'web_curated' | 'user_import';

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
    }) => AddOrGetByUrlResult;
    addUserImport: (input: {
        title: string;
        content: string;
        difficulty?: ReadingDifficulty;
    }) => string;
    updateDifficulty: (id: string, difficulty: ReadingDifficulty) => void;
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
                };
                set((state) => ({ articles: [...state.articles, article] }));
                return id;
            },
            updateDifficulty: (id, difficulty) =>
                set((state) => ({
                    articles: state.articles.map((a) => (a.id === id ? { ...a, difficulty } : a)),
                })),
            remove: (id) =>
                set((state) => ({
                    articles: state.articles.filter((a) => a.id !== id),
                })),
            getById: (id) => get().articles.find((a) => a.id === id),
        }),
        {
            name: 'lingovibe_reading_library',
            version: 2,
            migrate: (persisted) => persisted,
            storage: createJSONStorage(() => localStorage),
        },
    ),
);
