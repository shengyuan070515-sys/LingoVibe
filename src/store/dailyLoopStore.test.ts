import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDailyLoopStore, syncDailyLoopDate } from './dailyLoopStore';

// 用 fake timer 固定"今天"的日历日，模拟跨日
function setNowTo(dateString: string) {
    vi.setSystemTime(new Date(dateString));
}

function resetStore(dateString: string) {
    setNowTo(dateString);
    useDailyLoopStore.setState({
        // 直接赋值 dateKey 以进入受控的初始状态
        dateKey: new Date(dateString).toISOString().slice(0, 10),
        reviewQueueDone: false,
        chatRoundDone: false,
        readingDone: false,
    });
}

describe('dailyLoopStore · 同一天内的标记', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetStore('2026-04-16T10:00:00');
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('markReviewQueueDone / markChatRoundDone / markReadingDone 互相独立', () => {
        const s = useDailyLoopStore.getState();
        s.markReviewQueueDone();
        expect(useDailyLoopStore.getState().reviewQueueDone).toBe(true);
        expect(useDailyLoopStore.getState().chatRoundDone).toBe(false);
        expect(useDailyLoopStore.getState().readingDone).toBe(false);

        s.markChatRoundDone();
        expect(useDailyLoopStore.getState().chatRoundDone).toBe(true);
        expect(useDailyLoopStore.getState().reviewQueueDone).toBe(true);

        s.markReadingDone();
        expect(useDailyLoopStore.getState().readingDone).toBe(true);
    });

    it('同一天重复调用标记不会出错也不会重置其他字段', () => {
        const s = useDailyLoopStore.getState();
        s.markChatRoundDone();
        s.markChatRoundDone();
        s.markChatRoundDone();
        expect(useDailyLoopStore.getState().chatRoundDone).toBe(true);
    });
});

describe('dailyLoopStore · 跨日自动重置', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('昨天把三项都做完了，今天调用任一 mark 会先清空旧完成状态，再置当前项为 true', () => {
        // 昨天：全部完成
        resetStore('2026-04-15T22:00:00');
        useDailyLoopStore.setState({
            reviewQueueDone: true,
            chatRoundDone: true,
            readingDone: true,
        });
        expect(useDailyLoopStore.getState().dateKey).toBe('2026-04-15');

        // 时间来到第二天
        setNowTo('2026-04-16T08:00:00');

        // 今天调用一次 markChatRoundDone：rollToToday 应先把三项清零，再设置 chatRoundDone=true
        useDailyLoopStore.getState().markChatRoundDone();

        const state = useDailyLoopStore.getState();
        expect(state.dateKey).toBe('2026-04-16');
        expect(state.reviewQueueDone).toBe(false); // 昨天的状态已被清
        expect(state.readingDone).toBe(false); // 昨天的状态已被清
        expect(state.chatRoundDone).toBe(true); // 今天本次标记
    });

    it('syncDailyLoopDate 可在页面进入时主动对齐日历日', () => {
        resetStore('2026-04-15T22:00:00');
        useDailyLoopStore.setState({
            reviewQueueDone: true,
            chatRoundDone: true,
            readingDone: true,
        });

        setNowTo('2026-04-16T08:00:00');
        syncDailyLoopDate();

        const state = useDailyLoopStore.getState();
        expect(state.dateKey).toBe('2026-04-16');
        expect(state.reviewQueueDone).toBe(false);
        expect(state.chatRoundDone).toBe(false);
        expect(state.readingDone).toBe(false);
    });

    it('syncDailyLoopDate 在同一天调用是幂等的', () => {
        resetStore('2026-04-16T10:00:00');
        useDailyLoopStore.setState({
            reviewQueueDone: true,
            chatRoundDone: false,
            readingDone: true,
        });
        syncDailyLoopDate();
        const state = useDailyLoopStore.getState();
        // 同一天内不应清空任何标记
        expect(state.reviewQueueDone).toBe(true);
        expect(state.readingDone).toBe(true);
        expect(state.chatRoundDone).toBe(false);
    });
});
