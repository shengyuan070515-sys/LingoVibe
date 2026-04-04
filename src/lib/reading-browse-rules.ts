const ENGLISH_WORD_RE = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function countEnglishWords(text: string): number {
  const matches = text.match(ENGLISH_WORD_RE)
  return matches ? matches.length : 0
}

export function equivalentWordCountForMixedText(text: string): number {
  const cjkMatches = text.match(/[\u4e00-\u9fff]/g)
  const cjkChars = cjkMatches ? cjkMatches.length : 0
  return countEnglishWords(text) + Math.ceil(cjkChars / 2)
}

export function minDwellSecondsForBrowse(wordCount: number): number {
  return clamp(Math.round(0.06 * wordCount), 40, 180)
}

export function passesQuizAtLeastEightyPercent(correct: number, total: number): boolean {
  if (total < 5) return false
  return correct * 5 >= total * 4
}