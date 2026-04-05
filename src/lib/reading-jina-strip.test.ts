import { describe, expect, it } from 'vitest';
import { stripJinaReaderPreamble } from './reading-jina-strip';

describe('stripJinaReaderPreamble', () => {
    it('removes leading label lines', () => {
        const raw = `Title: Hello\nURL Source: https://x.com\nMarkdown Content:\n\n# Real\nbody`;
        expect(stripJinaReaderPreamble(raw)).toContain('# Real');
        expect(stripJinaReaderPreamble(raw)).not.toMatch(/^Title:/m);
    });

    it('leaves normal markdown', () => {
        expect(stripJinaReaderPreamble('# Hi\nthere')).toBe('# Hi\nthere');
    });
});
