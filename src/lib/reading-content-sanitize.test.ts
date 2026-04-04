import { describe, expect, it } from 'vitest';
import { stripMarkdownInlineLinks } from './reading-content-sanitize';

describe('stripMarkdownInlineLinks', () => {
    it('replaces [text](url) with text', () => {
        expect(stripMarkdownInlineLinks('[Kally Ng](https://example.com/u)')).toBe('Kally Ng');
    });

    it('leaves surrounding prose', () => {
        expect(stripMarkdownInlineLinks('Hi [there](http://a.com) end.')).toBe('Hi there end.');
    });

    it('does not strip image markdown', () => {
        expect(stripMarkdownInlineLinks('![cap](https://img/x.png)')).toBe('![cap](https://img/x.png)');
    });

    it('handles empty link label', () => {
        expect(stripMarkdownInlineLinks('x[](http://a)y')).toBe('xy');
    });
});
