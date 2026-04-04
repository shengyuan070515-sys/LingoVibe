import { describe, expect, it } from 'vitest'
import { canonicalizeUrl, sameCanonicalUrl } from './reading-url'

describe('canonicalizeUrl', () => {
  it('strips hash from URL', () => {
    expect(canonicalizeUrl('https://example.com/path#frag')).toBe(
      'https://example.com/path',
    )
  })

  it('normalizes trailing slash except root', () => {
    expect(canonicalizeUrl('https://example.com/foo/')).toBe(
      'https://example.com/foo',
    )
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/')
  })

  it('lowercases hostname', () => {
    expect(canonicalizeUrl('https://EXAMPLE.COM/x')).toBe('https://example.com/x')
  })

  it('rejects non-http(s) schemes', () => {
    expect(canonicalizeUrl('ftp://example.com/')).toBeNull()
  })

  it('returns null on parse failure', () => {
    expect(canonicalizeUrl('not a url')).toBeNull()
  })
})

describe('sameCanonicalUrl', () => {
  it('same URL with different hash is equal', () => {
    expect(
      sameCanonicalUrl(
        'https://example.com/article#intro',
        'https://example.com/article#refs',
      ),
    ).toBe(true)
  })

  it('http vs https are not equal', () => {
    expect(
      sameCanonicalUrl('http://example.com/foo', 'https://example.com/foo'),
    ).toBe(false)
  })

  it('host comparison is case insensitive', () => {
    expect(
      sameCanonicalUrl(
        'https://Example.COM/path',
        'https://example.com/path',
      ),
    ).toBe(true)
  })

  it('both invalid => false', () => {
    expect(sameCanonicalUrl('bad', 'also bad')).toBe(false)
  })
})