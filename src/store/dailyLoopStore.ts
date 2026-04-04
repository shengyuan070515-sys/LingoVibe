import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayKey } from '@/lib/learning-analytics';

/** 纪要 C1/G2：今日闭环三项与日历日对齐，跨日自动重置 */
interface DailyLoopState {
    dateKey: string;
    reviewQueueDone: boolean;
    chatRoundDone: boolean;
    readingDone: boolean;
    markReviewQueueDone: () => void;
    markChatRoundDone: () => void;
    markReadingDone: () => void;
}

function rollToToday(
    s: Pick<DailyLoopState, 'dateKey' | 'reviewQueueDone' | 'chatRoundDone' | 'readingDone'>
): Pick<DailyLoopState, 'dateKey' | 'reviewQueueDone' | 'chatRoundDone' | 'readingDone'> {
    const t = todayKey();
    if (s.dateKey === t) return s;
    return {
        dateKey: t,
        reviewQueueDone: false,
        chatRoundDone: false,
        readingDone: false,
    };
}

type V1PersistedSlice = {
    dateKey?: string;
    reviewQueueDone?: boolean;
    chatRoundDone?: boolean;
    podcastDone?: boolean;
    readingDone?: boolean;
};

export const useDailyLoopStore = create<DailyLoopState>()(
    persist(
        (set) => ({
            dateKey: todayKey(),
            reviewQueueDone: false,
            chatRoundDone: false,
            readingDone: false,

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
        }),
        {
            name: 'lingovibe_daily_loop',
            version: 2,
            storage: createJSONStorage(() => localStorage),
            migrate: (persistedState, version) => {
                const s = persistedState as V1PersistedSlice;
                if (version < 2 && s && typeof s === 'object' && 'podcastDone' in s) {
                    const { podcastDone, ...rest } = s;
                    return {
                        ...rest,
                        readingDone: podcastDone ?? rest.readingDone ?? false,
                    };
                }
                return persistedState as V1PersistedSlice;
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
        });
    }
}