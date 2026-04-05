/** 英文 token：允许内部 ' ' ’ - */
const ENGLISH_TOKEN = /^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/;

function stripEdgePunctuation(s: string): string {
    return s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * 划选分类（UI 决策）：恰好 1 个英文 token 且 ≤48 → word；≥2 个英文 token → sentence；无英文 token → chinese_only
 */
export function classifyReadingSelection(raw: string): 'chinese_only' | 'word' | 'sentence' {
    const t = raw.trim();
    if (!t) return 'chinese_only';
    if (!/[a-zA-Z]/.test(t)) return 'chinese_only';

    const tokens = t.split(/\s+/).filter(Boolean);
    const cleaned = tokens.map((tok) => stripEdgePunctuation(tok));
    const englishTokens = cleaned.filter((tok) => tok.length > 0 && ENGLISH_TOKEN.test(tok));

    if (englishTokens.length === 0) return 'chinese_only';
    if (englishTokens.length >= 2) return 'sentence';

    const w = englishTokens[0];
    if (w.length > 48) return 'sentence';
    return 'word';
}

/** 在已判定为 word 的选区内取出该英文词（用于查词 / 入库） */
export function soleEnglishTokenFromSelection(raw: string): string {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    const cleaned = tokens.map((tok) => stripEdgePunctuation(tok));
    const englishTokens = cleaned.filter((tok) => tok.length > 0 && ENGLISH_TOKEN.test(tok));
    return englishTokens[0] ?? raw.trim().slice(0, 48);
}

/** 从正文截取选区附近作 LLM 语境 */
export function extractContextSnippet(fullText: string, needle: string, radius = 180): string {
    const i = fullText.indexOf(needle);
    if (i < 0) return fullText.slice(0, radius * 2);
    const start = Math.max(0, i - radius);
    const end = Math.min(fullText.length, i + needle.length + radius);
    return fullText.slice(start, end).trim();
}
