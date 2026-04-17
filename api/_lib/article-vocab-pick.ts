/**
 * 基于词典的文章重点词汇选取 pipeline：
 *
 *   正文分词 → 清洗/去停用词/去专有名词 → 批量查词典 →
 *   按学习价值 + 难度匹配打分 → 贪心去冗余 → 返回 Top N
 *
 * 这一步完全离线（不调 LLM），只走 Neon Postgres，延迟几十毫秒。
 * LLM 后续只需基于这批"已选好"的词生成例句即可，不再负责挑词。
 */

import { lookupWordsBulk, type DictEntry } from './dict-lookup.js';
import type { AiDifficulty } from './reading-article-generate.js';

export interface PickedVocabItem {
    word: string;
    entry: DictEntry;
    /** 是否被判定为"专业术语"（仅当文章主题契合时才会进入最终结果） */
    isProfessional: boolean;
    /** 展示用的 CEFR/考试标签，如 "B2" / "CET6"，UI 小标签单一显示 */
    displayLabel: string;
}

export interface PickVocabOptions {
    articleBody: string;
    difficulty: AiDifficulty;
    /** 话题（来自 Topic），用于判断专业术语是否与主题相关 */
    topic?: string;
    /** 最大返回数量，默认按难度档位（4/4/5/6/6） */
    maxItems?: number;
    /** 是否允许最多 1 个专业术语，默认 true */
    allowProfessional?: boolean;
}

/** 难度档位 → 目标词数 */
export function defaultVocabCountFor(difficulty: AiDifficulty): number {
    switch (difficulty) {
        case 1:
        case 2:
            return 4;
        case 3:
            return 5;
        case 4:
        case 5:
            return 6;
        default:
            return 5;
    }
}

/**
 * 每档难度对应"最理想"的词典难度分布区间。
 * 目标：比文章难度略高半档，让学习者确有收获。
 */
const DIFFICULTY_TARGET: Record<AiDifficulty, { min: number; max: number; ideal: number }> = {
    1: { min: 1, max: 2, ideal: 2 },
    2: { min: 2, max: 3, ideal: 2 },
    3: { min: 2, max: 4, ideal: 3 },
    4: { min: 3, max: 5, ideal: 4 },
    5: { min: 3, max: 5, ideal: 5 },
};

/* ----------------------------- 停用词表 ----------------------------- */

/** 高频功能词 + 基础实义词；这些不会当作"重点词"出现在卡片里 */
const STOPWORDS = new Set<string>([
    'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'for',
    'of', 'to', 'in', 'on', 'at', 'by', 'from', 'with', 'as', 'into',
    'onto', 'over', 'under', 'about', 'between', 'through', 'during', 'after', 'before',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
    'this', 'that', 'these', 'those', 'there', 'here', 'then', 'than', 'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'done', 'doing',
    'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    'not', 'no', 'yes',
    'if', 'then', 'else', 'because', 'though', 'although', 'while', 'whereas', 'unless', 'until', 'since',
    'very', 'too', 'also', 'just', 'only', 'even', 'still', 'already', 'yet',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'first', 'second', 'third', 'last', 'next', 'many', 'much', 'more', 'most', 'some', 'any', 'all', 'each', 'every', 'few', 'several', 'other', 'another', 'such',
    'thing', 'things', 'way', 'ways', 'time', 'times', 'day', 'days', 'year', 'years',
    'good', 'bad', 'big', 'small', 'new', 'old', 'young', 'long', 'short', 'high', 'low',
    'make', 'made', 'making', 'take', 'took', 'taken', 'taking', 'get', 'got', 'getting', 'give', 'gave', 'given', 'giving',
    'go', 'went', 'gone', 'going', 'come', 'came', 'coming', 'see', 'saw', 'seen', 'seeing',
    'know', 'knew', 'known', 'knowing', 'think', 'thought', 'thinking', 'say', 'said', 'saying',
    'people', 'person', 'man', 'woman', 'men', 'women', 'child', 'children',
    'also', 'however', 'therefore', 'moreover', 'furthermore', 'meanwhile', 'nevertheless',
    'its', "it's", "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "cannot", "couldn't", "shouldn't",
    "i'm", "you're", "he's", "she's", "we're", "they're", "i've", "you've", "we've", "they've",
]);

/** 专业领域标签关键词（判断 topic 中是否涉及该领域） */
const TOPIC_DOMAIN_HINTS: Record<string, string[]> = {
    science: ['science', 'scientific', 'physics', 'chemistry', 'biology', 'research', 'experiment'],
    technology: ['technology', 'tech', 'software', 'computer', 'internet', 'ai', 'digital', 'programming'],
    medicine: ['medical', 'medicine', 'health', 'disease', 'doctor', 'hospital', 'clinical', 'therapy'],
    business: ['business', 'economy', 'finance', 'market', 'investment', 'trade', 'corporate'],
    law: ['law', 'legal', 'court', 'judge', 'justice', 'legislation', 'attorney'],
    art: ['art', 'painting', 'sculpture', 'gallery', 'museum', 'artist', 'aesthetic'],
};

/* ------------------------------ 分词 ------------------------------ */

interface TokenStat {
    surface: string;   // 原文中的小写形式
    count: number;
    firstOffset: number;
    /** 出现过的原文 context（取第一次出现那句） */
    contextHint: string;
}

/** 把正文切成词 token，收集频次与首次上下文。 */
function tokenize(body: string): Map<string, TokenStat> {
    const stats = new Map<string, TokenStat>();
    /**
     * 专有名词判断：句首之外还保持大写首字母的词，99% 是人名/地名/品牌/组织。
     * 这里先记录所有词的首次出现位置和该位置之前的最后一个非空白字符，
     * 用于后续判断它是"句首偶然大写"还是"真专有名词"。
     */
    const re = /\b[A-Za-z][A-Za-z'-]{1,40}\b/g;
    let m: RegExpExecArray | null;
    let sentenceStart = 0;
    let lastSentenceEnd = -1;
    while ((m = re.exec(body)) !== null) {
        const raw = m[0];
        const offset = m.index;
        /** 粗略判断是否在句首（前面是 . ! ? \n 或字符串开头） */
        if (offset - 1 >= 0) {
            const prefix = body.slice(Math.max(0, offset - 10), offset);
            if (/[.!?\n]\s*$/.test(prefix) || offset === 0) {
                sentenceStart = offset;
                lastSentenceEnd = offset;
            }
        }
        const isCapitalized = /^[A-Z]/.test(raw);
        const isAllCaps = /^[A-Z]{2,}$/.test(raw);
        const atSentenceStart = offset === sentenceStart || offset === lastSentenceEnd;

        /** ALL CAPS 一律跳过（缩写/品牌） */
        if (isAllCaps) continue;

        /**
         * 大写首字母 + 不在句首 → 专有名词嫌疑，跳过。
         * 在句首的大写词我们无法判断，保留让词典里去筛（词典里通常只有小写版）。
         */
        if (isCapitalized && !atSentenceStart) continue;

        const lower = raw.toLowerCase();
        if (lower.length < 3) continue;
        if (STOPWORDS.has(lower)) continue;

        const s = stats.get(lower);
        if (s) {
            s.count += 1;
        } else {
            /** 取这个词所在句子作为 context */
            const before = body.slice(Math.max(0, offset - 120), offset);
            const after = body.slice(offset, Math.min(body.length, offset + 160));
            const sentBefore = before.split(/[.!?\n]/).pop() ?? '';
            const sentAfter = (after.split(/[.!?\n]/)[0] ?? '').trimEnd();
            stats.set(lower, {
                surface: lower,
                count: 1,
                firstOffset: offset,
                contextHint: (sentBefore + sentAfter).trim(),
            });
        }
    }
    return stats;
}

/* ------------------------------ 打分 ------------------------------ */

interface Scored {
    token: TokenStat;
    entry: DictEntry;
    score: number;
    isProfessional: boolean;
}

const PROFESSIONAL_TAG_RE = /\b(medical|scientific|法律|医学|化学|物理|生物|专业|术语)\b/i;

/** 判断 DictEntry 是否像专业术语（非 CET/TOEFL 通用高频词） */
function isProfessionalTerm(entry: DictEntry): boolean {
    const isCommonCert =
        !!entry.tag &&
        /\b(zk|gk|cet4|cet6|ky|toefl|ielts)\b/i.test(entry.tag);
    if (isCommonCert) return false;
    if (entry.oxford3000) return false;
    if (entry.cocaRank !== null && entry.cocaRank <= 10000) return false;
    /** 到这里一般是 GRE 级或 COCA 1W 开外，再看中文释义里是否含明显专业提示 */
    if (entry.translationZh && PROFESSIONAL_TAG_RE.test(entry.translationZh)) return true;
    /** COCA > 20000 又没大众考试标签，基本就是偏专业 */
    if (entry.cocaRank === null || entry.cocaRank > 20000) return true;
    return false;
}

/** 判断 topic 是否属于某专业领域 */
function topicDomain(topic: string | undefined): string | null {
    if (!topic) return null;
    const t = topic.toLowerCase();
    for (const [domain, hints] of Object.entries(TOPIC_DOMAIN_HINTS)) {
        if (hints.some((h) => t.includes(h))) return domain;
    }
    return null;
}

/**
 * 给每个候选词打分：难度匹配 + 词频（学习性价比）+ 在文里的支撑度。
 * 分数越高越优先入选。
 */
function scoreCandidate(token: TokenStat, entry: DictEntry, difficulty: AiDifficulty): number {
    const target = DIFFICULTY_TARGET[difficulty];
    let s = 0;

    /** 难度匹配（最高权重） */
    const delta = Math.abs(entry.difficultyLevel - target.ideal);
    s += (3 - delta) * 10;
    if (entry.difficultyLevel < target.min) s -= 15;
    if (entry.difficultyLevel > target.max) s -= 10;

    /** Collins 星级：越常用学习性价比越高（但过于常用已在 stopwords 过滤） */
    if (entry.collinsStar !== null) s += entry.collinsStar * 2;

    /** 是否带考试标签（zk/gk/cet4/cet6/ky/toefl/ielts/gre） */
    if (entry.tag) {
        if (/\bcet4\b/i.test(entry.tag) && difficulty <= 2) s += 6;
        if (/\bcet6\b/i.test(entry.tag) && difficulty === 3) s += 6;
        if (/\b(toefl|ielts|ky)\b/i.test(entry.tag) && difficulty >= 4) s += 6;
        if (/\bgre\b/i.test(entry.tag) && difficulty === 5) s += 6;
    }

    /** 文中出现次数（越稀有越突出，但至少出现 1 次；出现太多反而是一般词） */
    if (token.count === 1) s += 3;
    else if (token.count === 2) s += 1;
    else if (token.count >= 5) s -= 3;

    /** 有 Oxford 3000 标记 但我们目标是中级以上的，降权 */
    if (entry.oxford3000 && difficulty >= 3) s -= 3;

    /** 有中文释义才能展示卡片，加微量权重做 tiebreak */
    if (entry.translationZh) s += 1;

    return s;
}

/** 展示标签：优先考试名，其次 CEFR */
function displayLabelOf(entry: DictEntry): string {
    const tag = (entry.tag || '').toLowerCase();
    if (tag.includes('gre')) return 'GRE';
    if (tag.includes('toefl')) return 'TOEFL';
    if (tag.includes('ielts')) return 'IELTS';
    if (tag.includes('ky')) return '考研';
    if (tag.includes('cet6')) return 'CET6';
    if (tag.includes('cet4')) return 'CET4';
    if (tag.includes('gk')) return '高考';
    if (tag.includes('zk')) return '中考';
    if (entry.cefr) return entry.cefr;
    return `L${entry.difficultyLevel}`;
}

/** 两词之间的"冗余度"粗判：避免同一词族（run/running/runner）挤占多个位置 */
function isRedundant(a: string, b: string): boolean {
    if (a === b) return true;
    /** 前缀一致且长度差 ≤2，大概率同词族 */
    if (Math.abs(a.length - b.length) <= 2) {
        const minLen = Math.min(a.length, b.length);
        if (minLen >= 5 && a.slice(0, minLen - 1) === b.slice(0, minLen - 1)) return true;
    }
    return false;
}

/* ------------------------------ 主入口 ------------------------------ */

/**
 * 基于词典从文章中选取重点词汇。
 *
 * 调用方需保证数据库可用；若未配置，会抛 DictDbNotReadyError，
 * 由调用方决定是否回退到 AI 挑词。
 */
export async function pickVocabularyFromArticle(
    options: PickVocabOptions
): Promise<PickedVocabItem[]> {
    const difficulty = options.difficulty;
    const target = options.maxItems ?? defaultVocabCountFor(difficulty);
    const allowProfessional = options.allowProfessional !== false;
    const domain = topicDomain(options.topic);

    const stats = tokenize(options.articleBody);
    if (stats.size === 0) return [];

    const words = [...stats.keys()];
    const entries = await lookupWordsBulk(words);

    const scored: Scored[] = [];
    for (const [w, stat] of stats) {
        const entry = entries.get(w);
        if (!entry) continue;
        /** 没中文释义的词直接跳过（展示不了卡片） */
        if (!entry.translationZh) continue;

        const pro = isProfessionalTerm(entry);
        if (pro && !allowProfessional) continue;

        /** 过于简单（低于目标最低档）直接剔除，除非是 zk/gk 且用户难度 1/2 */
        const tgt = DIFFICULTY_TARGET[difficulty];
        if (entry.difficultyLevel < tgt.min) continue;

        const score = scoreCandidate(stat, entry, difficulty);
        scored.push({ token: stat, entry, score, isProfessional: pro });
    }

    scored.sort((a, b) => b.score - a.score);

    const picked: PickedVocabItem[] = [];
    const usedLemmas: string[] = [];
    let professionalUsed = false;

    for (const cand of scored) {
        if (picked.length >= target) break;

        /** 专业术语至多 1 个，且必须与主题相关 */
        if (cand.isProfessional) {
            if (professionalUsed) continue;
            if (!domain) continue;
            /** 有 domain 就允许入选一个 */
            professionalUsed = true;
        }

        /** 冗余：同词族只保留一个 */
        if (usedLemmas.some((prev) => isRedundant(prev, cand.entry.word))) continue;

        picked.push({
            word: cand.entry.word,
            entry: cand.entry,
            isProfessional: cand.isProfessional,
            displayLabel: displayLabelOf(cand.entry),
        });
        usedLemmas.push(cand.entry.word);
    }

    return picked;
}

/** 将 picked 转成 LLM 例句生成阶段需要的"简表" */
export function toPickedSummary(items: PickedVocabItem[]): {
    word: string;
    pos: string;
    translationZh: string;
    phonetic: string;
}[] {
    return items.map((p) => ({
        word: p.word,
        pos: p.entry.pos || '',
        translationZh: p.entry.translationZh || '',
        phonetic: p.entry.phonetic || '',
    }));
}
