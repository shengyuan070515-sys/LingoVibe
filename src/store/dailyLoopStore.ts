import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayKey } from '@/lib/learning-analytics';

/** 纪要 C1/G2：今日闭环三项与日历日对齐，跨日自动重置 */
interface DailyLoopState {
    dateKey: string;
    reviewQueueDone: boolean;
    chatRoundDone: boolean;
    readingDone: boolean;
    /** 今日已计入「阅读完成」的文章 ID 列表，按日复位，用于防同一文章反复刷分 */
    readingCompletedArticleIds: string[];
    markReviewQueueDone: () => void;
    markChatRoundDone: () => void;
    markReadingDone: () => void;
    /**
     * 尝试为某篇文章登记「今日已完成」。
     * 返回 true 表示这是今日首次完成（调用方可继续 recordReadingSession + 弹 toast）；
     * 返回 false 表示今日已计过分（调用方应静默跳过）。
     */
    tryMarkReadingArticleCompleted: (articleId: string) => boolean;
}

type RollableSlice = Pick<
    DailyLoopState,
    'dateKey' | 'reviewQueueDone' | 'chatRoundDone' | 'readingDone' | 'readingCompletedArticleIds'
>;

function rollToToday(s: RollableSlice): RollableSlice {
    const t = todayKey();
    if (s.dateKey === t) return s;
    return {
        dateKey: t,
        reviewQueueDone: false,
        chatRoundDone: false,
        readingDone: false,
        readingCompletedArticleIds: [],
    };
}

type V1PersistedSlice = {
    dateKey?: string;
    reviewQueueDone?: boolean;
    chatRoundDone?: boolean;
    podcastDone?: boolean;
    readingDone?: boolean;
    readingCompletedArticleIds?: string[];
};

export const useDailyLoopStore = create<DailyLoopState>()(
    persist(
        (set, get) => ({
            dateKey: todayKey(),
            reviewQueueDone: false,
            chatRoundDone: false,
            readingDone: false,
            readingCompletedArticleIds: [],

            markReviewQueueDone: () =>
                set((s) => {
                    const base = rollToToday(s);
                    return { ...base, reviewQueueDone: true };
                }),

            markChatRoundDone: () =>
                set((s) => {
                    const base = rollToToday(s);
                    return { ...base, chatRoundDone: true };
                }),

            markReadingDone: () =>
                set((s) => {
                    const base = rollToToday(s);
                    return { ...base, readingDone: true };
                }),

            tryMarkReadingArticleCompleted: (articleId) => {
                if (!articleId) return false;
                const before = rollToToday(get());
                if (before.readingCompletedArticleIds.includes(articleId)) {
                    // 当日已计过分 → 静默跳过
                    if (before !== get()) set(before);
                    return false;
                }
                set({
                    ...before,
                    readingDone: true,
                    readingCompletedArticleIds: [...before.readingCompletedArticleIds, articleId],
                });
                return true;
            },
        }),
        {
            name: 'lingovibe_daily_loop',
            version: 3,
            storage: createJSONStorage(() => localStorage),
            migrate: (persistedState, version) => {
                const s = persistedState as V1PersistedSlice;
                if (!s || typeof s !== 'object') return persistedState as V1PersistedSlice;
                let next: V1PersistedSlice = s;
                if (version < 2 && 'podcastDone' in s) {
                    const { podcastDone, ...rest } = s;
                    next = {
                        ...rest,
                        readingDone: podcastDone ?? rest.readingDone ?? false,
                    };
                }
                if (version < 3) {
                    next = {
                        ...next,
                        readingCompletedArticleIds: next.readingCompletedArticleIds ?? [],
                    };
                }
                return next;
            },
        }
    )
);

/** 供页面在渲染前同步日历（不依赖 persist 回调顺序）*/
export function syncDailyLoopDate(): void {
    const s = useDailyLoopStore.getState();
    const t = todayKey();
    if (s.dateKey !== t) {
        useDailyLoopStore.setState({
            dateKey: t,
            reviewQueueDone: false,
            chatRoundDone: false,
            readingDone: false,
            readingCompletedArticleIds: [],
        });
    }
}