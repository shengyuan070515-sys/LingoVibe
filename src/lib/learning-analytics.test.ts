import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeLearningStreak, toLocalDateKey } from './learning-analytics';

// 辅助：基于 "今天" 生成 N 天前的 key
function keyDaysAgo(n: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return toLocalDateKey(d.getTime());
}

describe('computeLearningStreak · GitHub 风格连续天数', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-16T10:00:00'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('空记录 → 0', () => {
        expect(computeLearningStreak({})).toBe(0);
    });

    it('今天有活跃 → 1', () => {
        expect(computeLearningStreak({ [keyDaysAgo(0)]: 5 })).toBe(1);
    });

    it('今天+昨天连续 → 2', () => {
        expect(
            computeLearningStreak({ [keyDaysAgo(0)]: 1, [keyDaysAgo(1)]: 2 })
        ).toBe(2);
    });

    it('今天空白，但昨天连续 3 天 → 3（不打断）', () => {
        expect(
            computeLearningStreak({
                [keyDaysAgo(1)]: 1,
                [keyDaysAgo(2)]: 1,
                [keyDaysAgo(3)]: 1,
            })
        ).toBe(3);
    });

    it('今天空白，昨天也空白 → 0（断了）', () => {
        expect(
            computeLearningStreak({
                [keyDaysAgo(2)]: 1,
                [keyDaysAgo(3)]: 1,
            })
        ).toBe(0);
    });

    it('中间有断层，只统计从最近回溯的连续段', () => {
        expect(
            computeLearningStreak({
                [keyDaysAgo(0)]: 1,
                [keyDaysAgo(1)]: 1,
                // 第 2 天断
                [keyDaysAgo(3)]: 1,
                [keyDaysAgo(4)]: 1,
                [keyDaysAgo(5)]: 1,
            })
        ).toBe(2);
    });

    it('今天 score=0（显式的 0）视作空白，退一格继续查', () => {
        expect(
            computeLearningStreak({
                [keyDaysAgo(0)]: 0,
                [keyDaysAgo(1)]: 3,
                [keyDaysAgo(2)]: 3,
            })
        ).toBe(2);
    });

    it('连续一整周活跃 → 7', () => {
        const daily: Record<string, number> = {};
        for (let i = 0; i < 7; i++) daily[keyDaysAgo(i)] = 1;
        expect(computeLearningStreak(daily)).toBe(7);
    });
});
