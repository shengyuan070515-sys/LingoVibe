export function canonicalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  const path = url.pathname
  if (path.length > 1 && path.endsWith('/')) {
    url.pathname = path.slice(0, -1)
  }
  return url.href
}

export function sameCanonicalUrl(a: string, b: string): boolean {
  const ca = canonicalizeUrl(a)
  const cb = canonicalizeUrl(b)
  if (ca === null || cb === null) return false
  return ca === cb
}