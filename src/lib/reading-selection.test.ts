import { describe, expect, it } from 'vitest';
import { classifyReadingSelection } from './reading-selection';

describe('classifyReadingSelection', () => {
    it('single word', () => {
        expect(classifyReadingSelection('ephemeral')).toBe('word');
        expect(classifyReadingSelection("don't")).toBe('word');
        expect(classifyReadingSelection('well-known')).toBe('word');
    });

    it('sentence', () => {
        expect(classifyReadingSelection('Hello world')).toBe('sentence');
        expect(classifyReadingSelection('a b')).toBe('sentence');
    });

    it('chinese only', () => {
        expect(classifyReadingSelection('你好')).toBe('chinese_only');
        expect(classifyReadingSelection('')).toBe('chinese_only');
    });
});
