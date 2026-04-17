import type { ReviewLogEntry } from '@/store/reviewLogStore';

export interface WordAccuracyResult {
    /** Lifetime accuracy in [0, 1], or null when countedReviews < 3. */
    rate: number | null;
    /** know + forgot + learning — what the UI shows next to the % as "N 次". */
    totalReviews: number;
    /** know + forgot — the denominator that drives `rate` and its threshold. */
    countedReviews: number;
}

const MIN_COUNTED_REVIEWS = 3;

/**
 * Compute a word's lifetime review accuracy from the review log.
 *
 * - `learning` outcomes are excluded from both numerator and denominator
 *   (they're self-reported "still working on it" and shouldn't move the rate).
 * - The percentage is only revealed once `countedReviews >= 3` to avoid
 *   noisy 0%/100% readings after a single review.
 */
export function computeWordAccuracy(
    entries: ReviewLogEntry[],
    wordId: string,
): WordAccuracyResult {
    let totalReviews = 0;
    let countedReviews = 0;
    let knowCount = 0;
    for (const e of entries) {
        if (e.wordId !== wordId) continue;
        totalReviews += 1;
        if (e.outcome === 'know') {
            countedReviews += 1;
            knowCount += 1;
        } else if (e.outcome === 'forgot') {
            countedReviews += 1;
        }
    }
    const rate =
        countedReviews >= MIN_COUNTED_REVIEWS ? knowCount / countedReviews : null;
    return { rate, totalReviews, countedReviews };
}
