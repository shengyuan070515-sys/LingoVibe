import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLearningAnalyticsStore } from './learningAnalyticsStore';
import { todayKey, toLocalDateKey } from '@/lib/learning-analytics';

function resetStore() {
    useLearningAnalyticsStore.setState({
        dailyActivity: {},
        backfillFromWordsDone: false,
        lifetime: {
            wordsAdded: 0,
            chatMessages: 0,
            visualLookups: 0,
            readingSessions: 0,
            srsReviews: 0,
        },
    });
}

describe('learningAnalyticsStore.recordEvent · 累计计数 + 当日加权', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-16T10:00:00'));
        resetStore();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('word_added 加 wordsAdded 生命值计数，当日活跃度 +3', () => {
        const s = useLearningAnalyticsStore.getState();
        s.recordEvent('word_added');
        const state = useLearningAnalyticsStore.getState();
        expect(state.lifetime.wordsAdded).toBe(1);
        expect(state.dailyActivity[todayKey()]).toBe(3);
    });

    it('reading_session 当日活跃度 +5', () => {
        useLearningAnalyticsStore.getState().recordEvent('reading_session');
        expect(useLearningAnalyticsStore.getState().dailyActivity[todayKey()]).toBe(5);
        expect(useLearningAnalyticsStore.getState().lifetime.readingSessions).toBe(1);
    });

    it('同一天多次事件权重会累加', () => {
        const s = useLearningAnalyticsStore.getState();
        s.recordEvent('word_added'); // +3
        s.recordEvent('chat_message'); // +2
        s.recordEvent('visual_lookup'); // +2
        s.recordEvent('reading_session'); // +5
        s.recordEvent('srs_review'); // +2
        expect(useLearningAnalyticsStore.getState().dailyActivity[todayKey()]).toBe(14);
    });

    it('amount 参数会按倍数放大当日活跃度与生命值计数', () => {
        useLearningAnalyticsStore.getState().recordEvent('srs_review', 5); // +2×5=10
        const state = useLearningAnalyticsStore.getState();
        expect(state.dailyActivity[todayKey()]).toBe(10);
        expect(state.lifetime.srsReviews).toBe(5);
    });
});

describe('learningAnalyticsStore.backfillActivityFromWords · 幂等', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-16T10:00:00'));
        resetStore();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('按 addedAt 的日历日聚合计分，每词 +3', () => {
        const d1 = new Date('2026-04-10T09:00:00').getTime();
        const d2 = new Date('2026-04-12T09:00:00').getTime();
        useLearningAnalyticsStore.getState().backfillActivityFromWords([
            { addedAt: d1 },
            { addedAt: d1 }, // 同一天两个词
            { addedAt: d2 },
        ]);
        const state = useLearningAnalyticsStore.getState();
        expect(state.dailyActivity[toLocalDateKey(d1)]).toBe(6);
        expect(state.dailyActivity[toLocalDateKey(d2)]).toBe(3);
        expect(state.backfillFromWordsDone).toBe(true);
    });

    it('再次调用不会重复计入（幂等）', () => {
        const d1 = new Date('2026-04-10T09:00:00').getTime();
        const words = [{ addedAt: d1 }, { addedAt: d1 }];
        useLearningAnalyticsStore.getState().backfillActivityFromWords(words);
        const firstScore = useLearningAnalyticsStore.getState().dailyActivity[toLocalDateKey(d1)];
        useLearningAnalyticsStore.getState().backfillActivityFromWords(words);
        const secondScore = useLearningAnalyticsStore.getState().dailyActivity[toLocalDateKey(d1)];
        expect(secondScore).toBe(firstScore);
    });

    it('与已有当日活跃度取最大值而非叠加（避免刷历史时双计）', () => {
        const d1 = new Date('2026-04-10T09:00:00').getTime();
        // 已经存在更高的当日活跃度（比如当天还做过其他事情）
        useLearningAnalyticsStore.setState({
            dailyActivity: { [toLocalDateKey(d1)]: 10 },
        });
        useLearningAnalyticsStore.getState().backfillActivityFromWords([
            { addedAt: d1 },
            { addedAt: d1 },
        ]);
        // 原来 10 vs 回填 6 → 取最大 10
        expect(useLearningAnalyticsStore.getState().dailyActivity[toLocalDateKey(d1)]).toBe(10);
    });

    it('空数组直接返回，不翻转 backfill 标志', () => {
        useLearningAnalyticsStore.getState().backfillActivityFromWords([]);
        expect(useLearningAnalyticsStore.getState().backfillFromWordsDone).toBe(false);
    });

    it('wordsAdded 生命值取当前与回填数量的最大值', () => {
        useLearningAnalyticsStore.setState({
            lifetime: {
                wordsAdded: 50,
                chatMessages: 0,
                visualLookups: 0,
                readingSessions: 0,
                srsReviews: 0,
            },
        });
        useLearningAnalyticsStore.getState().backfillActivityFromWords([
            { addedAt: Date.now() },
            { addedAt: Date.now() },
        ]);
        // 原来 50 vs 回填 2 → 保持 50
        expect(useLearningAnalyticsStore.getState().lifetime.wordsAdded).toBe(50);
    });
});
