import type { WordBankItem } from '@/store/wordBankStore';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 间隔阶梯（保守版 · 7 档）：
 * level 0 → 1 天
 * level 1 → 2 天
 * level 2 → 4 天
 * level 3 → 7 天
 * level 4 → 14 天
 * level 5 → 30 天
 * level 6 → 60 天
 * level 7+ → 60 天（封顶）
 *
 * 这里的 level 指的是「本次自评前」的 level。
 * 也就是说：一个全新的单词（level=0）自评「会」后，间隔 1 天；
 * 再次自评「会」时 level=1，间隔 2 天；依此类推。
 */
const INTERVAL_LADDER_DAYS: readonly number[] = [1, 2, 4, 7, 14, 30, 60] as const;

export function daysUntilNextAfterKnow(level: number): number {
    if (level < 0) return INTERVAL_LADDER_DAYS[0]!;
    if (level >= INTERVAL_LADDER_DAYS.length) {
        return INTERVAL_LADDER_DAYS[INTERVAL_LADDER_DAYS.length - 1]!;
    }
    return INTERVAL_LADDER_DAYS[level]!;
}

/** 自评「会」：level + 1，按新阶梯取下一次间隔 */
export function patchWordAfterKnow(w: WordBankItem): Pick<WordBankItem, 'level' | 'interval' | 'nextReviewDate'> {
    const days = daysUntilNextAfterKnow(w.level);
    const now = Date.now();
    return {
        level: w.level + 1,
        interval: days,
        nextReviewDate: now + days * DAY_MS,
    };
}

/**
 * 自评「不熟」：
 * - level 退回 max(0, 当前 level - 2)，不完全归零，保留一定历史
 * - 1 天后再见
 */
export function patchWordAfterForgot(w: WordBankItem): Pick<WordBankItem, 'level' | 'interval' | 'nextReviewDate'> {
    const days = 1;
    const now = Date.now();
    const nextLevel = Math.max(0, (w.level ?? 0) - 2);
    return {
        level: nextLevel,
        interval: days,
        nextReviewDate: now + days * DAY_MS,
    };
}

/**
 * 自评「学习中 / 模糊」：
 * - level 保持不变
 * - 间隔减半（向下取整，最小 1 天）；若当前间隔无效则退化为 1 天
 */
export function patchWordAfterLearning(w: WordBankItem): Pick<WordBankItem, 'level' | 'interval' | 'nextReviewDate'> {
    const baseInterval = Number.isFinite(w.interval) && w.interval > 0 ? w.interval : 1;
    const days = Math.max(1, Math.floor(baseInterval / 2));
    const now = Date.now();
    return {
        level: w.level,
        interval: days,
        nextReviewDate: now + days * DAY_MS,
    };
}

/** C2a + D3a：仅单词，且已到复习时间 */
export function selectDueWords(words: WordBankItem[], now = Date.now()): WordBankItem[] {
    return words
        .filter((w) => w && w.type === 'word' && typeof w.word === 'string' && w.nextReviewDate <= now)
        .sort((a, b) => {
            if (a.nextReviewDate !== b.nextReviewDate) return a.nextReviewDate - b.nextReviewDate;
            return a.level - b.level;
        });
}
