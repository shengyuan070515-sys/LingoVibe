import { describe, expect, it } from 'vitest';
import { hostnameMatchesAllowlist, urlMatchesCategoryDomains } from './reading-featured-config';

describe('reading-featured-config', () => {
    it('hostnameMatchesAllowlist handles www and subdomains', () => {
        const domains = ['theguardian.com'] as const;
        expect(hostnameMatchesAllowlist('www.theguardian.com', domains)).toBe(true);
        expect(hostnameMatchesAllowlist('theguardian.com', domains)).toBe(true);
        expect(hostnameMatchesAllowlist('world.theguardian.com', domains)).toBe(true);
        expect(hostnameMatchesAllowlist('evil.com', domains)).toBe(false);
    });

    it('urlMatchesCategoryDomains', () => {
        expect(urlMatchesCategoryDomains('https://www.nature.com/articles/foo', ['nature.com'])).toBe(true);
        expect(urlMatchesCategoryDomains('https://npr.org/sections/foo', ['npr.org'])).toBe(true);
        expect(urlMatchesCategoryDomains('https://economist.com/foo', ['nature.com'])).toBe(false);
    });
});
