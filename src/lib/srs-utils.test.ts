import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    daysUntilNextAfterKnow,
    patchWordAfterKnow,
    patchWordAfterForgot,
    patchWordAfterLearning,
    selectDueWords,
} from './srs-utils';
import type { WordBankItem } from '@/store/wordBankStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date('2026-04-16T00:00:00Z').getTime();

function makeWord(partial: Partial<WordBankItem> = {}): WordBankItem {
    return {
        id: partial.id ?? 'id-1',
        word: partial.word ?? 'example',
        phonetic: '',
        pos: '',
        translation: '',
        exampleSentence: '',
        exampleTranslation: '',
        type: 'word',
        addedAt: partial.addedAt ?? FIXED_NOW - DAY_MS,
        nextReviewDate: partial.nextReviewDate ?? FIXED_NOW,
        interval: partial.interval ?? 1,
        level: partial.level ?? 0,
        ...partial,
    };
}

describe('daysUntilNextAfterKnow', () => {
    it('maps level 0..6 to the conservative ladder', () => {
        expect(daysUntilNextAfterKnow(0)).toBe(1);
        expect(daysUntilNextAfterKnow(1)).toBe(2);
        expect(daysUntilNextAfterKnow(2)).toBe(4);
        expect(daysUntilNextAfterKnow(3)).toBe(7);
        expect(daysUntilNextAfterKnow(4)).toBe(14);
        expect(daysUntilNextAfterKnow(5)).toBe(30);
        expect(daysUntilNextAfterKnow(6)).toBe(60);
    });

    it('caps at 60 days for level 7+', () => {
        expect(daysUntilNextAfterKnow(7)).toBe(60);
        expect(daysUntilNextAfterKnow(20)).toBe(60);
    });

    it('handles negative level defensively', () => {
        expect(daysUntilNextAfterKnow(-1)).toBe(1);
    });
});

describe('patchWordAfterKnow', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('increments level and pushes nextReviewDate by the new ladder', () => {
        const w = makeWord({ level: 0, interval: 1 });
        const patch = patchWordAfterKnow(w);
        expect(patch.level).toBe(1);
        expect(patch.interval).toBe(1);
        expect(patch.nextReviewDate).toBe(FIXED_NOW + 1 * DAY_MS);
    });

    it('level 3 → 7 days interval', () => {
        const w = makeWord({ level: 3 });
        const patch = patchWordAfterKnow(w);
        expect(patch.level).toBe(4);
        expect(patch.interval).toBe(7);
    });

    it('level 6 → 60 days; further knows stay at 60', () => {
        const w6 = makeWord({ level: 6 });
        expect(patchWordAfterKnow(w6).interval).toBe(60);
        const w10 = makeWord({ level: 10 });
        expect(patchWordAfterKnow(w10).interval).toBe(60);
    });
});

describe('patchWordAfterForgot', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('drops level by 2 and schedules 1 day later', () => {
        const w = makeWord({ level: 5, interval: 30 });
        const patch = patchWordAfterForgot(w);
        expect(patch.level).toBe(3);
        expect(patch.interval).toBe(1);
        expect(patch.nextReviewDate).toBe(FIXED_NOW + DAY_MS);
    });

    it('never goes below 0 even when current level is small', () => {
        expect(patchWordAfterForgot(makeWord({ level: 0 })).level).toBe(0);
        expect(patchWordAfterForgot(makeWord({ level: 1 })).level).toBe(0);
        expect(patchWordAfterForgot(makeWord({ level: 2 })).level).toBe(0);
    });
});

describe('patchWordAfterLearning', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps level, halves the interval, floors at 1 day', () => {
        expect(patchWordAfterLearning(makeWord({ level: 3, interval: 30 }))).toMatchObject({
            level: 3,
            interval: 15,
        });
        expect(patchWordAfterLearning(makeWord({ level: 2, interval: 7 }))).toMatchObject({
            level: 2,
            interval: 3, // floor(7/2)
        });
        expect(patchWordAfterLearning(makeWord({ level: 1, interval: 1 }))).toMatchObject({
            level: 1,
            interval: 1, // floor(0.5) -> 0, then clamped to 1
        });
    });

    it('falls back to 1 day when interval is invalid', () => {
        expect(patchWordAfterLearning(makeWord({ interval: 0 })).interval).toBe(1);
        expect(patchWordAfterLearning(makeWord({ interval: NaN })).interval).toBe(1);
        expect(patchWordAfterLearning(makeWord({ interval: -5 })).interval).toBe(1);
    });

    it('sets nextReviewDate based on the halved interval', () => {
        const patch = patchWordAfterLearning(makeWord({ level: 4, interval: 14 }));
        expect(patch.nextReviewDate).toBe(FIXED_NOW + 7 * DAY_MS);
    });
});

describe('selectDueWords', () => {
    it('returns only word-type items whose nextReviewDate has passed', () => {
        const now = FIXED_NOW;
        const due = makeWord({ id: 'a', nextReviewDate: now - 1000 });
        const notDue = makeWord({ id: 'b', nextReviewDate: now + 1000 });
        const sentence = makeWord({ id: 'c', nextReviewDate: now - 1000, type: 'sentence' });
        const result = selectDueWords([due, notDue, sentence], now);
        expect(result.map((x) => x.id)).toEqual(['a']);
    });

    it('sorts by nextReviewDate ASC, then by level ASC', () => {
        const now = FIXED_NOW;
        const older = makeWord({ id: 'older', nextReviewDate: now - 10000, level: 5 });
        const newer = makeWord({ id: 'newer', nextReviewDate: now - 1000, level: 0 });
        const sameTimeHighLevel = makeWord({ id: 'high', nextReviewDate: now - 1000, level: 3 });
        const result = selectDueWords([sameTimeHighLevel, newer, older], now);
        expect(result.map((x) => x.id)).toEqual(['older', 'newer', 'high']);
    });
});
