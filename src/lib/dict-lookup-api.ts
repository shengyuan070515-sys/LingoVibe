/**
 * 前端调用 GET /api/dict-lookup。
 *
 * 视觉词典的第一数据源：命中时提供更可靠的 phonetic / pos / 中文释义。
 * 未命中或数据库未配置时返回 null，调用方继续走 AI 兜底。
 */

export interface DictLookupEntry {
    word: string;
    phonetic: string | null;
    definitionEn: string | null;
    translationZh: string | null;
    pos: string | null;
    collinsStar: number | null;
    oxford3000: boolean;
    tag: string | null;
    bncRank: number | null;
    cocaRank: number | null;
    cefr: string | null;
    difficultyLevel: number;
}

type LookupResponse =
    | { hit: true; entry: DictLookupEntry }
    | { hit: false; reason: 'not_found' | 'db_not_ready' | 'error'; detail?: string };

function apiBase(): string {
    return (import.meta.env.VITE_READING_API_BASE as string | undefined)?.trim().replace(/\/$/, '') ?? '';
}

export async function lookupDictWord(word: string, signal?: AbortSignal): Promise<DictLookupEntry | null> {
    const w = word.trim();
    if (!w) return null;
    const base = apiBase();
    const url = `${base}/api/dict-lookup?word=${encodeURIComponent(w)}`;
    try {
        const r = await fetch(url, { method: 'GET', signal });
        if (!r.ok) return null;
        const j = (await r.json()) as LookupResponse;
        if (j.hit) return j.entry;
        return null;
    } catch {
        return null;
    }
}
