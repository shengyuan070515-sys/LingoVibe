import type { WordBankItem } from '@/store/wordBankStore';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 纪要 D2b：自评「会」后的间隔阶梯（按当前 level 决定下一次间隔天数） */
export function daysUntilNextAfterKnow(level: number): number {
    if (level <= 0) return 1;
    if (level === 1) return 3;
    return 7;
}

export function patchWordAfterKnow(w: WordBankItem): Pick<WordBankItem, 'level' | 'interval' | 'nextReviewDate'> {
    const days = daysUntilNextAfterKnow(w.level);
    const now = Date.now();
    return {
        level: w.level + 1,
        interval: days,
        nextReviewDate: now + days * DAY_MS,
    };
}

/** 「不会」：回到起点，次日再见 */
export function patchWordAfterForgot(): Pick<WordBankItem, 'level' | 'interval' | 'nextReviewDate'> {
    const days = 1;
    const now = Date.now();
    return {
        level: 0,
        interval: days,
        nextReviewDate: now + days * DAY_MS,
    };
}

/** 「模糊 / 学习中」：不升阶，次日再练（与「会」「不会」并列的第三档） */
export function patchWordAfterLearning(w: WordBankItem): Pick<WordBankItem, 'level' | 'interval' | 'nextReviewDate'> {
    const days = 1;
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
