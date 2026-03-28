import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayKey, toLocalDateKey, type LifetimeCounters } from '@/lib/learning-analytics';

export type ActivityEvent =
    | 'word_added'
    | 'chat_message'
    | 'visual_lookup'
    | 'podcast_session'
    | 'srs_review';

const EVENT_WEIGHT: Record<ActivityEvent, number> = {
    word_added: 3,
    chat_message: 2,
    visual_lookup: 2,
    podcast_session: 5,
    srs_review: 2,
};

interface LearningAnalyticsState {
    dailyActivity: Record<string, number>;
    lifetime: LifetimeCounters;
    /** One-time merge of historical word adds into heatmap */
    backfillFromWordsDone: boolean;
    recordEvent: (event: ActivityEvent, amount?: number) => void;
    /** Merge `addedAt` into daily heatmap once (idempotent). */
    backfillActivityFromWords: (words: { addedAt: number }[]) => void;
}

export const useLearningAnalyticsStore = create<LearningAnalyticsState>()(
    persist(
        (set, get) => ({
            dailyActivity: {},
            lifetime: {
                wordsAdded: 0,
                chatMessages: 0,
                visualLookups: 0,
                podcastSessions: 0,
                srsReviews: 0,
            },
            backfillFromWordsDone: false,

            recordEvent: (event, amount = 1) => {
                const day = todayKey();
                const w = (EVENT_WEIGHT[event] ?? 1) * amount;
                set((s) => {
                    const dailyActivity = { ...s.dailyActivity, [day]: (s.dailyActivity[day] ?? 0) + w };
                    const life = { ...s.lifetime };
                    if (event === 'word_added') life.wordsAdded += amount;
                    if (event === 'chat_message') life.chatMessages += amount;
                    if (event === 'visual_lookup') life.visualLookups += amount;
                    if (event === 'podcast_session') life.podcastSessions += amount;
                    if (event === 'srs_review') life.srsReviews += amount;
                    return { dailyActivity, lifetime: life };
                });
            },

            backfillActivityFromWords: (words) => {
                if (get().backfillFromWordsDone || words.length === 0) return;
                const daily = { ...get().dailyActivity };
                const byDay: Record<string, number> = {};
                for (const w of words) {
                    const k = toLocalDateKey(w.addedAt);
                    byDay[k] = (byDay[k] ?? 0) + 3;
                }
                for (const [k, v] of Object.entries(byDay)) {
                    daily[k] = Math.max(daily[k] ?? 0, v);
                }
                const s = get();
                set({
                    dailyActivity: daily,
                    backfillFromWordsDone: true,
                    lifetime: {
                        ...s.lifetime,
                        wordsAdded: Math.max(s.lifetime.wordsAdded, words.length),
                    },
                });
            },
        }),
        {
            name: 'lingovibe_learning_analytics',
            version: 1,
            storage: createJSONStorage(() => localStorage),
        }
    )
);

export function recordWordAdded(): void {
    useLearningAnalyticsStore.getState().recordEvent('word_added', 1);
}

export function recordChatMessage(): void {
    useLearningAnalyticsStore.getState().recordEvent('chat_message', 1);
}

export function recordVisualLookup(): void {
    useLearningAnalyticsStore.getState().recordEvent('visual_lookup', 1);
}

export function recordPodcastSession(): void {
    useLearningAnalyticsStore.getState().recordEvent('podcast_session', 1);
}

export function recordSrsReviews(count: number): void {
    if (count <= 0) return;
    useLearningAnalyticsStore.getState().recordEvent('srs_review', count);
}
