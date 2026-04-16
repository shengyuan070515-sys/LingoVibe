import { describe, it, expect } from 'vitest';
import { extractFromFreeDict } from './word-utils';

describe('extractFromFreeDict', () => {
    it('returns null for empty / invalid input', () => {
        expect(extractFromFreeDict(null)).toBeNull();
        expect(extractFromFreeDict(undefined)).toBeNull();
        expect(extractFromFreeDict([])).toBeNull();
        expect(extractFromFreeDict([{}])).toBeNull();
        expect(extractFromFreeDict([{ meanings: [] }])).toBeNull();
    });

    it('extracts phonetic from top-level phonetic field first', () => {
        const data = [
            {
                phonetic: '/rʌn/',
                phonetics: [{ text: '/ruːn/' }],
                meanings: [
                    { partOfSpeech: 'verb', definitions: [{ definition: 'to move quickly' }] },
                ],
            },
        ];
        const result = extractFromFreeDict(data);
        expect(result?.phonetic).toBe('/rʌn/');
    });

    it('falls back to first non-empty phonetics[].text when phonetic is missing', () => {
        const data = [
            {
                phonetic: '',
                phonetics: [{ text: '' }, { text: '/hɛˈloʊ/' }, { text: '/həˈloʊ/' }],
                meanings: [
                    { partOfSpeech: 'noun', definitions: [{ definition: 'a greeting' }] },
                ],
            },
        ];
        const result = extractFromFreeDict(data);
        expect(result?.phonetic).toBe('/hɛˈloʊ/');
    });

    it('returns empty phonetic when no phonetic info exists', () => {
        const data = [
            {
                meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'x' }] }],
            },
        ];
        const result = extractFromFreeDict(data);
        expect(result?.phonetic).toBe('');
    });

    it('uses the first meaning partOfSpeech as pos', () => {
        const data = [
            {
                meanings: [
                    { partOfSpeech: 'verb', definitions: [{ definition: 'to run' }] },
                    { partOfSpeech: 'noun', definitions: [{ definition: 'a run' }] },
                ],
            },
        ];
        expect(extractFromFreeDict(data)?.pos).toBe('verb');
    });

    it('defaults pos to "unknown" when missing', () => {
        const data = [{ meanings: [{ definitions: [{ definition: 'x' }] }] }];
        expect(extractFromFreeDict(data)?.pos).toBe('unknown');
    });

    it('flattens definitions across meanings in order, capped at MAX_TOTAL_DEFS=6', () => {
        const mkDefs = (n: number) =>
            Array.from({ length: n }, (_, i) => ({ definition: `def${i + 1}` }));
        const data = [
            {
                meanings: [
                    { partOfSpeech: 'verb', definitions: mkDefs(5) }, // only first 3 taken (MAX_DEFS_PER_POS)
                    { partOfSpeech: 'noun', definitions: mkDefs(5) }, // only first 3 taken
                    { partOfSpeech: 'adj',  definitions: mkDefs(5) }, // would overflow, capped at 6 total
                ],
            },
        ];
        const result = extractFromFreeDict(data);
        expect(result?.definitionsEn).toEqual(['def1', 'def2', 'def3', 'def1', 'def2', 'def3']);
        expect(result?.definitionsEn.length).toBe(6);
    });

    it('picks the first non-empty example it encounters', () => {
        const data = [
            {
                meanings: [
                    {
                        partOfSpeech: 'verb',
                        definitions: [
                            { definition: 'first', example: '' },
                            { definition: 'second', example: 'I run daily.' },
                            { definition: 'third', example: 'She runs fast.' },
                        ],
                    },
                ],
            },
        ];
        expect(extractFromFreeDict(data)?.exampleEn).toBe('I run daily.');
    });

    it('leaves exampleEn empty when no definition provides one', () => {
        const data = [
            {
                meanings: [
                    { partOfSpeech: 'noun', definitions: [{ definition: 'a word' }] },
                ],
            },
        ];
        expect(extractFromFreeDict(data)?.exampleEn).toBe('');
    });

    it('skips empty/whitespace definition strings', () => {
        const data = [
            {
                meanings: [
                    {
                        partOfSpeech: 'verb',
                        definitions: [
                            { definition: '' },
                            { definition: '   ' },
                            { definition: 'real one' },
                        ],
                    },
                ],
            },
        ];
        const result = extractFromFreeDict(data);
        expect(result?.definitionsEn).toEqual(['real one']);
    });

    it('returns null when every meaning has no valid definition', () => {
        const data = [
            {
                meanings: [
                    { partOfSpeech: 'noun', definitions: [{ definition: '' }, {}] },
                    { partOfSpeech: 'verb', definitions: [] },
                ],
            },
        ];
        expect(extractFromFreeDict(data)).toBeNull();
    });

    it('handles the case where only the first entry matters (ignores extras)', () => {
        const data = [
            {
                meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'first entry' }] }],
            },
            {
                meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'second entry' }] }],
            },
        ];
        const result = extractFromFreeDict(data);
        expect(result?.pos).toBe('noun');
        expect(result?.definitionsEn).toEqual(['first entry']);
    });
});
