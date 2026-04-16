import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WordBankItem } from './wordBankStore';

// Mock 掉 wordBankStore 的外部依赖：fetchWordDetails / fetchUnsplashImages / 另一个 store
// 这些都只影响 addWord 的异步尾巴；去重/增删等纯逻辑不受影响。
vi.mock('@/lib/word-utils', () => ({
    fetchWordDetails: vi.fn(async (word: string) => ({
        word,
        phonetic: '',
        pos: 'noun',
        translation: `${word}的翻译`,
        exampleSentence: '',
        exampleTranslation: '',
    })),
}));
vi.mock('@/lib/unsplash', () => ({
    fetchUnsplashImages: vi.fn(async () => [] as string[]),
}));
vi.mock('@/store/learningAnalyticsStore', () => ({
    recordWordAdded: vi.fn(),
    recordSrsReviews: vi.fn(),
}));
vi.mock('@/store/reviewLogStore', () => ({
    useReviewLogStore: {
        getState: () => ({ push: vi.fn() }),
    },
}));

// 在 mock 之后再 import 被测模块，确保 mock 生效
import { useWordBankStore } from './wordBankStore';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeItem(partial: Partial<WordBankItem> = {}): WordBankItem {
    return {
        id: partial.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
        word: partial.word ?? 'example',
        phonetic: partial.phonetic ?? '',
        pos: partial.pos ?? '',
        translation: partial.translation ?? '',
        exampleSentence: partial.exampleSentence ?? '',
        exampleTranslation: partial.exampleTranslation ?? '',
        type: partial.type ?? 'word',
        addedAt: partial.addedAt ?? Date.now(),
        nextReviewDate: partial.nextReviewDate ?? Date.now(),
        interval: partial.interval ?? 1,
        level: partial.level ?? 0,
        ...partial,
    };
}

function resetStore() {
    useWordBankStore.setState({ words: [] });
}

describe('wordBankStore.dedupeWords', () => {
    beforeEach(() => resetStore());

    it('does nothing when there are no duplicates', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: '1', word: 'apple' }),
                makeItem({ id: '2', word: 'banana' }),
            ],
        });
        const removed = useWordBankStore.getState().dedupeWords('keep-newest');
        expect(removed).toBe(0);
        expect(useWordBankStore.getState().words).toHaveLength(2);
    });

    it('treats word case-insensitively when grouping', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: '1', word: 'Apple', addedAt: 100 }),
                makeItem({ id: '2', word: 'apple', addedAt: 200 }),
                makeItem({ id: '3', word: 'APPLE', addedAt: 300 }),
            ],
        });
        const removed = useWordBankStore.getState().dedupeWords('keep-newest');
        expect(removed).toBe(2);
        expect(useWordBankStore.getState().words).toHaveLength(1);
    });

    it('keeps different types (word vs sentence) separate', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: '1', word: 'run', type: 'word' }),
                makeItem({ id: '2', word: 'run', type: 'sentence' }),
            ],
        });
        const removed = useWordBankStore.getState().dedupeWords('keep-newest');
        expect(removed).toBe(0);
        expect(useWordBankStore.getState().words).toHaveLength(2);
    });

    it('keep-newest: retains the item with the largest addedAt', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: 'old', word: 'apple', addedAt: 100, translation: 'old' }),
                makeItem({ id: 'new', word: 'apple', addedAt: 500, translation: 'new' }),
                makeItem({ id: 'mid', word: 'apple', addedAt: 300, translation: 'mid' }),
            ],
        });
        useWordBankStore.getState().dedupeWords('keep-newest');
        const words = useWordBankStore.getState().words;
        expect(words).toHaveLength(1);
        expect(words[0]!.id).toBe('new');
    });

    it('keep-rich: prefers higher level, then richer translation', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: 'l0-long', word: 'apple', level: 0, translation: 'a long translation' }),
                makeItem({ id: 'l3-short', word: 'apple', level: 3, translation: 'x' }),
                makeItem({ id: 'l3-longer', word: 'apple', level: 3, translation: 'much longer translation' }),
            ],
        });
        useWordBankStore.getState().dedupeWords('keep-rich');
        const words = useWordBankStore.getState().words;
        expect(words).toHaveLength(1);
        expect(words[0]!.id).toBe('l3-longer');
    });

    it('keep-newest enriches the winner with missing fields from losers', () => {
        useWordBankStore.setState({
            words: [
                makeItem({
                    id: 'old',
                    word: 'apple',
                    addedAt: 100,
                    phonetic: '/ˈæpəl/',
                    exampleSentence: 'I ate an apple.',
                    exampleTranslation: '我吃了一个苹果。',
                    synonyms: ['fruit'],
                    images: ['img-old.jpg'],
                }),
                makeItem({
                    id: 'new',
                    word: 'apple',
                    addedAt: 500,
                    phonetic: '',
                    translation: 'new-translation',
                    exampleSentence: '',
                    synonyms: [],
                    images: ['img-new.jpg'],
                }),
            ],
        });
        useWordBankStore.getState().dedupeWords('keep-newest');
        const words = useWordBankStore.getState().words;
        expect(words).toHaveLength(1);
        const w = words[0]!;
        expect(w.id).toBe('new');
        expect(w.translation).toBe('new-translation');
        expect(w.phonetic).toBe('/ˈæpəl/'); // 从老条目补
        expect(w.exampleSentence).toBe('I ate an apple.'); // 从老条目补
        expect(w.exampleTranslation).toBe('我吃了一个苹果。');
        expect(w.synonyms).toEqual(['fruit']); // 老条目的非空 synonyms
        expect(w.images).toEqual(expect.arrayContaining(['img-new.jpg', 'img-old.jpg'])); // 图片合并去重
    });

    it('skips empty/whitespace words entirely', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: '1', word: '   ' }),
                makeItem({ id: '2', word: 'apple' }),
            ],
        });
        useWordBankStore.getState().dedupeWords('keep-newest');
        const words = useWordBankStore.getState().words;
        expect(words.map((w) => w.id)).toEqual(['2']);
    });

    it("does not crash on non-placeholder translation overwriting placeholder", () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: 'a', word: 'apple', addedAt: 100, translation: '翻译加载中...' }),
                makeItem({ id: 'b', word: 'apple', addedAt: 50, translation: '苹果' }),
            ],
        });
        useWordBankStore.getState().dedupeWords('keep-newest');
        const w = useWordBankStore.getState().words[0]!;
        expect(w.id).toBe('a');
        // winner 的 translation 是占位符，应被 loser 的真实翻译覆盖
        expect(w.translation).toBe('苹果');
    });

    it('merges allDefinitions when winner lacks them', () => {
        useWordBankStore.setState({
            words: [
                makeItem({
                    id: 'new',
                    word: 'run',
                    addedAt: 500,
                    translation: '跑',
                    allDefinitions: undefined,
                }),
                makeItem({
                    id: 'old',
                    word: 'run',
                    addedAt: 100,
                    translation: '跑步',
                    allDefinitions: ['跑', '运营', '运行'],
                }),
            ],
        });
        useWordBankStore.getState().dedupeWords('keep-newest');
        const w = useWordBankStore.getState().words[0]!;
        expect(w.id).toBe('new');
        expect(w.allDefinitions).toEqual(['跑', '运营', '运行']);
    });
});

describe('wordBankStore.addWord', () => {
    beforeEach(() => resetStore());

    it('silently ignores empty/invalid payloads', async () => {
        const { addWord } = useWordBankStore.getState();
        await addWord('');
        await addWord('   ');
        await addWord(null as any);
        await addWord(undefined as any);
        await addWord({} as any);
        await addWord({ word: '' } as any);
        expect(useWordBankStore.getState().words).toHaveLength(0);
    });

    it('accepts string payload and optimistically inserts immediately', async () => {
        const { addWord } = useWordBankStore.getState();
        const p = addWord('serendipity');
        // 乐观更新在 await 之前就生效
        const snapshotBefore = useWordBankStore.getState().words;
        expect(snapshotBefore).toHaveLength(1);
        expect(snapshotBefore[0]!.word).toBe('serendipity');
        await p;
    });

    it('extracts word from object payload variants (word/query/text/content)', async () => {
        const { addWord } = useWordBankStore.getState();
        await addWord({ word: 'alpha' });
        await addWord({ query: 'beta' });
        await addWord({ text: 'gamma' });
        await addWord({ content: 'delta' });
        const words = useWordBankStore.getState().words.map((w) => w.word);
        expect(words).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma', 'delta']));
        expect(words).toHaveLength(4);
    });

    it('de-duplicates by case-insensitive word match', async () => {
        const { addWord } = useWordBankStore.getState();
        await addWord('apple');
        await addWord('APPLE');
        await addWord('Apple');
        expect(useWordBankStore.getState().words).toHaveLength(1);
    });

    it('preserves explicit type=sentence instead of defaulting to word', async () => {
        const { addWord } = useWordBankStore.getState();
        await addWord({ word: 'Time flies.', type: 'sentence' });
        const w = useWordBankStore.getState().words[0]!;
        expect(w.type).toBe('sentence');
    });

    it('seeds new items with level=0, interval=1, nextReviewDate=now', async () => {
        const before = Date.now();
        await useWordBankStore.getState().addWord('ephemeral');
        const after = Date.now();
        const w = useWordBankStore.getState().words[0]!;
        expect(w.level).toBe(0);
        expect(w.interval).toBe(1);
        expect(w.nextReviewDate).toBeGreaterThanOrEqual(before);
        expect(w.nextReviewDate).toBeLessThanOrEqual(after + 1000);
    });
});

describe('wordBankStore.removeInvalidWords', () => {
    beforeEach(() => resetStore());

    it('removes items with non-string or empty word', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: '1', word: 'ok' }),
                makeItem({ id: '2', word: '' }),
                makeItem({ id: '3', word: '   ' }),
                { ...makeItem({ id: '4' }), word: null as any }, // 模拟坏数据
            ],
        });
        const removed = useWordBankStore.getState().removeInvalidWords();
        expect(removed).toBe(3);
        expect(useWordBankStore.getState().words).toHaveLength(1);
    });
});

describe('wordBankStore.sortWords', () => {
    beforeEach(() => resetStore());

    it('sorts by addedAt desc / asc', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: 'a', word: 'a', addedAt: 100 }),
                makeItem({ id: 'b', word: 'b', addedAt: 300 }),
                makeItem({ id: 'c', word: 'c', addedAt: 200 }),
            ],
        });
        useWordBankStore.getState().sortWords('added-desc');
        expect(useWordBankStore.getState().words.map((w) => w.id)).toEqual(['b', 'c', 'a']);
        useWordBankStore.getState().sortWords('added-asc');
        expect(useWordBankStore.getState().words.map((w) => w.id)).toEqual(['a', 'c', 'b']);
    });

    it('sorts alphabetically (case-insensitive)', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: '1', word: 'banana' }),
                makeItem({ id: '2', word: 'Apple' }),
                makeItem({ id: '3', word: 'cherry' }),
            ],
        });
        useWordBankStore.getState().sortWords('alpha');
        expect(useWordBankStore.getState().words.map((w) => w.word)).toEqual([
            'Apple',
            'banana',
            'cherry',
        ]);
    });

    it('sorts by review-soon (ascending nextReviewDate)', () => {
        const now = Date.now();
        useWordBankStore.setState({
            words: [
                makeItem({ id: 'far', nextReviewDate: now + 10 * DAY_MS }),
                makeItem({ id: 'soon', nextReviewDate: now + 1 * DAY_MS }),
                makeItem({ id: 'mid', nextReviewDate: now + 3 * DAY_MS }),
            ],
        });
        useWordBankStore.getState().sortWords('review-soon');
        expect(useWordBankStore.getState().words.map((w) => w.id)).toEqual(['soon', 'mid', 'far']);
    });

    it('sorts by level desc, with addedAt as tiebreaker', () => {
        useWordBankStore.setState({
            words: [
                makeItem({ id: 'l0', level: 0, addedAt: 100 }),
                makeItem({ id: 'l5a', level: 5, addedAt: 100 }),
                makeItem({ id: 'l5b', level: 5, addedAt: 300 }),
                makeItem({ id: 'l3', level: 3, addedAt: 400 }),
            ],
        });
        useWordBankStore.getState().sortWords('level-desc');
        expect(useWordBankStore.getState().words.map((w) => w.id)).toEqual([
            'l5b',
            'l5a',
            'l3',
            'l0',
        ]);
    });
});
