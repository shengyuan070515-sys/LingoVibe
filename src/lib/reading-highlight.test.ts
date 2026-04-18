import { describe, it, expect } from 'vitest';
import { planHighlightSegments } from './reading-highlight';

const opts = (o?: Partial<{ phrases: string[]; keyWords: string[]; savedWords: Set<string> }>) => ({
    phrases: o?.phrases ?? [],
    keyWords: o?.keyWords ?? [],
    savedWords: o?.savedWords ?? new Set<string>(),
});

describe('planHighlightSegments', () => {
    it('returns a single plain segment when nothing matches', () => {
        const r = planHighlightSegments('Hello world.', opts());
        expect(r).toEqual([{ text: 'Hello world.', kind: 'none' }]);
    });

    it('highlights a single keyword with word boundaries', () => {
        const r = planHighlightSegments('I like apples.', opts({ keyWords: ['apple'] }));
        expect(r).toEqual([{ text: 'I like apples.', kind: 'none' }]);
    });

    it('case-insensitive exact word match', () => {
        const r = planHighlightSegments('APPLE pie is nice.', opts({ keyWords: ['apple'] }));
        expect(r).toEqual([
            { text: 'APPLE', kind: 'keyword', term: 'apple' },
            { text: ' pie is nice.', kind: 'none' },
        ]);
    });

    it('phrases beat keywords (precedence)', () => {
        const r = planHighlightSegments('climate change matters.', opts({
            phrases: ['climate change'],
            keyWords: ['climate', 'change'],
        }));
        expect(r.map((s) => s.kind)).toEqual(['phrase', 'none']);
        expect(r[0]!.text).toBe('climate change');
    });

    it('longest phrase wins over shorter overlapping phrase', () => {
        const r = planHighlightSegments('on the verge of collapse', opts({
            phrases: ['on the verge', 'on the verge of'],
        }));
        expect(r[0]!.text).toBe('on the verge of');
        expect(r[0]!.kind).toBe('phrase');
    });

    it('saved words get the lowest precedence', () => {
        const r = planHighlightSegments('I read about climate change today.', opts({
            phrases: ['climate change'],
            keyWords: ['read'],
            savedWords: new Set(['today', 'climate']),
        }));
        const kinds = r.map((s) => s.kind);
        expect(kinds).toContain('phrase');
        expect(kinds).toContain('keyword');
        expect(kinds).toContain('saved');
        // 'climate' overlaps the phrase — phrase wins, not saved
        const savedSegs = r.filter((s) => s.kind === 'saved');
        expect(savedSegs.some((s) => s.text.toLowerCase() === 'today')).toBe(true);
        expect(savedSegs.some((s) => s.text.toLowerCase() === 'climate')).toBe(false);
    });

    it('ignores empty / whitespace inputs in the vocab lists', () => {
        const r = planHighlightSegments('Hello', opts({
            phrases: ['', '   '],
            keyWords: [''],
            savedWords: new Set(['', '  ']),
        }));
        expect(r).toEqual([{ text: 'Hello', kind: 'none' }]);
    });

    it('preserves original casing in the segment text', () => {
        const r = planHighlightSegments('Climate Change is real.', opts({
            phrases: ['climate change'],
        }));
        expect(r[0]!.text).toBe('Climate Change');
    });

    it('supports multiple disjoint matches', () => {
        const r = planHighlightSegments('cats and dogs and birds', opts({
            keyWords: ['cats', 'dogs', 'birds'],
        }));
        expect(r.map((s) => s.kind)).toEqual(['keyword', 'none', 'keyword', 'none', 'keyword']);
    });

    it('does not match word substrings', () => {
        const r = planHighlightSegments('categorical', opts({ keyWords: ['cat'] }));
        expect(r).toEqual([{ text: 'categorical', kind: 'none' }]);
    });

    it('drops single-word entries from phrases (client-side guard for legacy articles)', () => {
        // 'sustainability' is a single word — it must not be treated as a phrase,
        // even if a legacy article's keyPhrases array contains it.
        const r = planHighlightSegments('Focus on sustainability and climate change.', opts({
            phrases: ['sustainability', 'climate change'],
        }));
        const phraseSegs = r.filter((s) => s.kind === 'phrase');
        expect(phraseSegs).toHaveLength(1);
        expect(phraseSegs[0]!.text.toLowerCase()).toBe('climate change');
    });

    it('still allows a single-word entry to highlight if it appears as a keyWord', () => {
        // If the AI only produced single-word "phrases", we prefer not to drop the
        // word entirely — downstream code can pass it via keyWords to keep it visible
        // (this test documents the separation of concerns).
        const r = planHighlightSegments('Sustainability matters.', opts({
            phrases: ['sustainability'],
            keyWords: ['sustainability'],
        }));
        const kinds = r.map((s) => s.kind);
        expect(kinds).toContain('keyword');
        expect(kinds).not.toContain('phrase');
    });
});

