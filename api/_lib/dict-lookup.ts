/**
 * 词典查询：从 Neon Postgres 的 dict_words / dict_exchange 表读数据。
 *
 * - 查询前自动小写
 * - 若词本身不在词典里，走 dict_exchange 做一次 lemma 回退
 * - 进程内 LRU 缓存避免重复查询同一篇文章里重复出现的词
 * - DB 未配置时优雅失败（抛 DictDbNotReadyError），调用方可回退到 AI 生成
 */

import { getSql, hasDictDb } from './db.js';

export interface DictEntry {
    /** 以小写 lemma 形式返回；若是通过 exchange 回退的，这里已是原形 */
    word: string;
    phonetic: string | null;
    definitionEn: string | null;
    translationZh: string | null;
    pos: string | null;
    collinsStar: number | null;
    oxford3000: boolean;
    /** 逗号分隔，如 "cet4,cet6,ielts" */
    tag: string | null;
    bncRank: number | null;
    cocaRank: number | null;
    cefr: string | null;
    difficultyLevel: number;
}

interface RawRow {
    word: string;
    phonetic: string | null;
    definition_en: string | null;
    translation_zh: string | null;
    pos: string | null;
    collins_star: number | null;
    oxford_3000: boolean;
    tag: string | null;
    bnc_rank: number | null;
    coca_rank: number | null;
    cefr: string | null;
    difficulty_level: number;
}

function rowToEntry(r: RawRow): DictEntry {
    return {
        word: r.word,
        phonetic: r.phonetic,
        definitionEn: r.definition_en,
        translationZh: r.translation_zh,
        pos: r.pos,
        collinsStar: r.collins_star,
        oxford3000: Boolean(r.oxford_3000),
        tag: r.tag,
        bncRank: r.bnc_rank,
        cocaRank: r.coca_rank,
        cefr: r.cefr,
        difficultyLevel: r.difficulty_level,
    };
}

/* ------------------------------ LRU 缓存 ------------------------------ */

const LRU_LIMIT = 4096;
const cache = new Map<string, DictEntry | null>();

function lruGet(key: string): DictEntry | null | undefined {
    if (!cache.has(key)) return undefined;
    const v = cache.get(key) as DictEntry | null;
    /** 触达就放到末尾 */
    cache.delete(key);
    cache.set(key, v);
    return v;
}

function lruSet(key: string, val: DictEntry | null): void {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, val);
    if (cache.size > LRU_LIMIT) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
    }
}

/* ------------------------------ 单词规范化 ------------------------------ */

const WORD_CLEAN = /^[a-z][a-z\-']{0,40}$/;

/**
 * 归一化：lowercase、strip 常见所有格/复数尾巴后的 fallback 查询在 lookupWord 内完成。
 * 这里只做最基本的清洗。
 */
export function normalizeWord(raw: string): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase().trim().replace(/[\u2019\u2018]/g, "'");
    if (!s) return null;
    /** 允许连字符和撇号，其它全部剔除 */
    if (!WORD_CLEAN.test(s)) {
        /** 去除首尾标点后再试 */
        const stripped = s.replace(/^[^a-z]+|[^a-z']+$/g, '');
        if (!stripped || !WORD_CLEAN.test(stripped)) return null;
        return stripped;
    }
    return s;
}

/* --------------------------------- 查询 --------------------------------- */

export { hasDictDb };

/** 单词查询。未命中返回 null。 */
export async function lookupWord(raw: string): Promise<DictEntry | null> {
    const w = normalizeWord(raw);
    if (!w) return null;
    const cached = lruGet(w);
    if (cached !== undefined) return cached;

    const sql = getSql();
    const direct = (await sql`
        SELECT word, phonetic, definition_en, translation_zh, pos,
               collins_star, oxford_3000, tag, bnc_rank, coca_rank, cefr, difficulty_level
        FROM dict_words
        WHERE word = ${w}
        LIMIT 1
    `) as RawRow[];
    if (direct.length > 0) {
        const entry = rowToEntry(direct[0]);
        lruSet(w, entry);
        return entry;
    }

    /** 回退：屈折形式 → lemma → 再查 dict_words */
    const ex = (await sql`
        SELECT lemma FROM dict_exchange WHERE inflected = ${w} LIMIT 1
    `) as { lemma: string }[];
    if (ex.length > 0) {
        const lemma = ex[0].lemma;
        const cachedLemma = lruGet(lemma);
        if (cachedLemma !== undefined) {
            lruSet(w, cachedLemma);
            return cachedLemma;
        }
        const lemRows = (await sql`
            SELECT word, phonetic, definition_en, translation_zh, pos,
                   collins_star, oxford_3000, tag, bnc_rank, coca_rank, cefr, difficulty_level
            FROM dict_words
            WHERE word = ${lemma}
            LIMIT 1
        `) as RawRow[];
        if (lemRows.length > 0) {
            const entry = rowToEntry(lemRows[0]);
            lruSet(lemma, entry);
            lruSet(w, entry);
            return entry;
        }
    }

    lruSet(w, null);
    return null;
}

/**
 * 批量查询：去重 + 一次 SQL 往返。
 * 返回 Map<原输入, DictEntry | null>（未命中值为 null）。
 *
 * 用于文章选词场景：一次性把正文里所有候选词的词典项全部拉回来。
 */
export async function lookupWordsBulk(raws: string[]): Promise<Map<string, DictEntry | null>> {
    const out = new Map<string, DictEntry | null>();
    if (raws.length === 0) return out;

    const normalizedPairs: { input: string; norm: string }[] = [];
    const toQuery = new Set<string>();
    for (const r of raws) {
        const n = normalizeWord(r);
        if (!n) {
            out.set(r, null);
            continue;
        }
        normalizedPairs.push({ input: r, norm: n });
        const cached = lruGet(n);
        if (cached !== undefined) {
            out.set(r, cached);
        } else {
            toQuery.add(n);
        }
    }

    if (toQuery.size > 0) {
        const sql = getSql();
        const words = [...toQuery];
        /** 第一次批量查 dict_words */
        const directRows = (await sql`
            SELECT word, phonetic, definition_en, translation_zh, pos,
                   collins_star, oxford_3000, tag, bnc_rank, coca_rank, cefr, difficulty_level
            FROM dict_words
            WHERE word = ANY(${words})
        `) as RawRow[];
        const directMap = new Map<string, DictEntry>();
        for (const r of directRows) {
            const e = rowToEntry(r);
            directMap.set(e.word, e);
            lruSet(e.word, e);
        }

        /** 对所有未直接命中的词，走 exchange 回退 */
        const missed = words.filter((w) => !directMap.has(w));
        const lemmaByInflected = new Map<string, string>();
        if (missed.length > 0) {
            const exRows = (await sql`
                SELECT inflected, lemma FROM dict_exchange WHERE inflected = ANY(${missed})
            `) as { inflected: string; lemma: string }[];
            for (const r of exRows) lemmaByInflected.set(r.inflected, r.lemma);

            /** 再批量查一次这些 lemma（有些可能已经在 directMap 里） */
            const neededLemmas = [...new Set([...lemmaByInflected.values()])].filter(
                (l) => !directMap.has(l)
            );
            if (neededLemmas.length > 0) {
                const lemRows = (await sql`
                    SELECT word, phonetic, definition_en, translation_zh, pos,
                           collins_star, oxford_3000, tag, bnc_rank, coca_rank, cefr, difficulty_level
                    FROM dict_words
                    WHERE word = ANY(${neededLemmas})
                `) as RawRow[];
                for (const r of lemRows) {
                    const e = rowToEntry(r);
                    directMap.set(e.word, e);
                    lruSet(e.word, e);
                }
            }
        }

        for (const w of words) {
            if (directMap.has(w)) continue;
            const lemma = lemmaByInflected.get(w);
            if (lemma && directMap.has(lemma)) {
                lruSet(w, directMap.get(lemma)!);
            } else {
                lruSet(w, null);
            }
        }
    }

    for (const { input, norm } of normalizedPairs) {
        if (out.has(input)) continue;
        const cached = lruGet(norm) ?? null;
        out.set(input, cached);
    }
    return out;
}

/* ----------------------------- 测试辅助 ----------------------------- */

export function __clearDictLookupCache(): void {
    cache.clear();
}
