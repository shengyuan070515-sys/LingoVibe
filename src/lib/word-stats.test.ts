import { describe, it, expect } from 'vitest';
import type { ReviewLogEntry } from '@/store/reviewLogStore';
import { computeWordAccuracy } from './word-stats';

function entry(partial: Partial<ReviewLogEntry>): ReviewLogEntry {
    return {
        at: partial.at ?? Date.now(),
        wordId: partial.wordId ?? 'w1',
        word: partial.word ?? 'apple',
        outcome: partial.outcome ?? 'know',
        levelBefore: partial.levelBefore ?? 0,
        levelAfter: partial.levelAfter ?? 1,
    };
}

describe('computeWordAccuracy', () => {
    it('returns totalReviews=0 and rate=null when no entries match the wordId', () => {
        const r = computeWordAccuracy([], 'w1');
        expect(r).toEqual({ rate: null, totalReviews: 0, countedReviews: 0 });
    });

    it('filters entries by wordId', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w2', outcome: 'forgot' }),
            ],
            'w1',
        );
        expect(r.totalReviews).toBe(1);
        expect(r.countedReviews).toBe(1);
        // below threshold => hide %
        expect(r.rate).toBeNull();
    });

    it('excludes `learning` outcomes from both numerator and denominator but counts them in totalReviews', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'forgot' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
            ],
            'w1',
        );
        expect(r.totalReviews).toBe(5);
        expect(r.countedReviews).toBe(3);
        expect(r.rate).toBeCloseTo(2 / 3, 5);
    });

    it('returns rate=null when countedReviews < 3 (threshold), even if totalReviews >= 3', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
                entry({ wordId: 'w1', outcome: 'learning' }),
            ],
            'w1',
        );
        expect(r.totalReviews).toBe(3);
        expect(r.countedReviews).toBe(1);
        expect(r.rate).toBeNull();
    });

    it('returns rate=1 for three straight knows', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'know' }),
                entry({ wordId: 'w1', outcome: 'know' }),
            ],
            'w1',
        );
        expect(r.rate).toBe(1);
        expect(r.countedReviews).toBe(3);
    });

    it('returns rate=0 for three straight forgots', () => {
        const r = computeWordAccuracy(
            [
                entry({ wordId: 'w1', outcome: 'forgot' }),
                entry({ wordId: 'w1', outcome: 'forgot' }),
                entry({ wordId: 'w1', outcome: 'forgot' }),
            ],
            'w1',
        );
        expect(r.rate).toBe(0);
        expect(r.countedReviews).toBe(3);
    });
});
