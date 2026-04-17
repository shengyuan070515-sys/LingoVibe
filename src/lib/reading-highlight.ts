export type HighlightKind = 'none' | 'phrase' | 'keyword' | 'saved';

export interface HighlightSegment {
    text: string;
    kind: HighlightKind;
    /** Lowercased matched term (for phrase/keyword/saved lookups downstream). */
    term?: string;
}

export interface HighlightPlanOptions {
    phrases: string[];
    keyWords: string[];
    savedWords: Set<string>;
}

interface Match {
    start: number;
    end: number;
    kind: Exclude<HighlightKind, 'none'>;
    term: string;
    priority: number; // lower = higher priority
}

const PRIORITY: Record<Exclude<HighlightKind, 'none'>, number> = {
    phrase: 0,
    keyword: 1,
    saved: 2,
};

function normalize(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
        const t = raw?.trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
    }
    return out;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findWordMatches(hay: string, needle: string, kind: 'keyword' | 'saved'): Match[] {
    const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'gi');
    const out: Match[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay)) !== null) {
        out.push({
            start: m.index,
            end: m.index + m[0].length,
            kind,
            term: needle.toLowerCase(),
            priority: PRIORITY[kind],
        });
        if (m.index === re.lastIndex) re.lastIndex += 1;
    }
    return out;
}

function findPhraseMatches(hay: string, phrase: string): Match[] {
    if (!phrase) return [];
    const lower = hay.toLowerCase();
    const target = phrase.toLowerCase();
    const out: Match[] = [];
    let i = 0;
    while (true) {
        const idx = lower.indexOf(target, i);
        if (idx < 0) break;
        out.push({
            start: idx,
            end: idx + target.length,
            kind: 'phrase',
            term: target,
            priority: PRIORITY.phrase,
        });
        i = idx + Math.max(1, target.length);
    }
    return out;
}

function resolveMatches(matches: Match[]): Match[] {
    // Sort by: priority asc, then length desc (longer first), then start asc
    const sorted = [...matches].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const la = a.end - a.start;
        const lb = b.end - b.start;
        if (la !== lb) return lb - la;
        return a.start - b.start;
    });
    const claimed: Match[] = [];
    for (const m of sorted) {
        const overlaps = claimed.some((c) => !(m.end <= c.start || m.start >= c.end));
        if (!overlaps) claimed.push(m);
    }
    return claimed.sort((a, b) => a.start - b.start);
}

export function planHighlightSegments(text: string, opts: HighlightPlanOptions): HighlightSegment[] {
    const phrases = normalize(opts.phrases);
    const keyWords = normalize(opts.keyWords);
    const savedWords = normalize(Array.from(opts.savedWords));

    if (phrases.length + keyWords.length + savedWords.length === 0 || !text) {
        return [{ text, kind: 'none' }];
    }

    const matches: Match[] = [];
    for (const p of phrases) matches.push(...findPhraseMatches(text, p));
    for (const w of keyWords) matches.push(...findWordMatches(text, w, 'keyword'));
    for (const w of savedWords) matches.push(...findWordMatches(text, w, 'saved'));

    const resolved = resolveMatches(matches);
    if (resolved.length === 0) return [{ text, kind: 'none' }];

    const out: HighlightSegment[] = [];
    let cursor = 0;
    for (const m of resolved) {
        if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), kind: 'none' });
        out.push({ text: text.slice(m.start, m.end), kind: m.kind, term: m.term });
        cursor = m.end;
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor), kind: 'none' });
    return out;
}

