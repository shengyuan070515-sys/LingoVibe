export interface StandardWordData {
    word: string;
    phonetic: string;
    pos: string;
    /** 主释义（取第一条，卡片展示用；10 字内最佳） */
    translation: string;
    exampleSentence: string;
    exampleTranslation: string;
    /** 完整的中文释义列表（按词性 + 顺序），卡片不展示，供未来扩展（多义查看 / AI 选义等） */
    allDefinitions?: string[];
}

export type WordBankKeyTestResult =
    | { ok: true }
    | { ok: false; message: string };

function getApiBase(): string {
    return ((import.meta.env.VITE_READING_API_BASE as string | undefined) ?? '').trim().replace(/\/$/, '');
}

async function callProxy(payload: object): Promise<unknown> {
    const base = getApiBase();
    const url = base ? `${base}/api/ai-proxy` : '/api/ai-proxy';
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        let errMsg = `请求失败 ${res.status}`;
        try {
            const errBody = await res.json();
            errMsg = (errBody as any)?.error || (errBody as any)?.detail || errMsg;
        } catch { /* ignore */ }
        throw new Error(errMsg);
    }
    return res.json();
}

function buildMinimalWordData(word: string, reason?: string): StandardWordData {
    const w = (word || '').trim();
    const tip = reason ? `翻译暂不可用：${reason}` : '翻译暂不可用';
    return {
        word: w,
        phonetic: '',
        pos: 'unknown',
        translation: tip,
        exampleSentence: '',
        exampleTranslation: '',
    };
}

/** 验证代理是否可用（替代原来的直连 key 测试） */
export async function testWordBankApiKey(_rawKey: string): Promise<WordBankKeyTestResult> {
    try {
        const data = await callProxy({
            messages: [
                { role: 'system', content: 'Return ONLY JSON.' },
                { role: 'user', content: 'Reply with {"ok": true}.' },
            ],
            response_format: { type: 'json_object' },
            temperature: 0,
        }) as any;
        if (data?.choices?.[0]?.message?.content) return { ok: true };
        return { ok: false, message: '代理返回内容异常' };
    } catch (error) {
        const reason = error instanceof Error ? error.message : '请求失败';
        return { ok: false, message: reason };
    }
}

// ─── Free Dictionary API 类型与抽取 ─────────────────────────────────────────

const FREE_DICT_ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

interface FreeDictDefinition {
    definition?: string;
    example?: string;
}
interface FreeDictMeaning {
    partOfSpeech?: string;
    definitions?: FreeDictDefinition[];
}
interface FreeDictPhonetic {
    text?: string;
}
interface FreeDictEntry {
    phonetic?: string;
    phonetics?: FreeDictPhonetic[];
    meanings?: FreeDictMeaning[];
}

/** 从 Free Dictionary 原始响应中抽取需要的字段 */
export interface FreeDictExtract {
    phonetic: string;
    pos: string;
    /** 所有词性 × 前 N 个英文释义，已按原顺序扁平化 */
    definitionsEn: string[];
    /** 从任一释义中挑到的第一个英文例句（可能为空） */
    exampleEn: string;
}

const MAX_DEFS_PER_POS = 3; // 每个词性最多取前 3 个释义
const MAX_TOTAL_DEFS = 6;   // 总释义上限，避免塞爆 prompt

export function extractFromFreeDict(entries: unknown): FreeDictExtract | null {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const first = entries[0] as FreeDictEntry | undefined;
    if (!first || typeof first !== 'object') return null;

    // 音标：优先 phonetic 字段，否则从 phonetics 数组里挑第一个非空 text
    let phonetic = (first.phonetic ?? '').trim();
    if (!phonetic && Array.isArray(first.phonetics)) {
        for (const p of first.phonetics) {
            if (p?.text && p.text.trim()) {
                phonetic = p.text.trim();
                break;
            }
        }
    }

    const meanings = Array.isArray(first.meanings) ? first.meanings : [];
    const pos = (meanings[0]?.partOfSpeech ?? '').trim() || 'unknown';

    const definitionsEn: string[] = [];
    let exampleEn = '';

    for (const m of meanings) {
        const defs = Array.isArray(m?.definitions) ? m.definitions : [];
        let takenFromThisPos = 0;
        for (const d of defs) {
            if (takenFromThisPos >= MAX_DEFS_PER_POS) break;
            if (definitionsEn.length >= MAX_TOTAL_DEFS) break;
            const text = (d?.definition ?? '').trim();
            if (!text) continue;
            definitionsEn.push(text);
            takenFromThisPos += 1;
            if (!exampleEn && d?.example && d.example.trim()) {
                exampleEn = d.example.trim();
            }
        }
        if (definitionsEn.length >= MAX_TOTAL_DEFS) break;
    }

    if (definitionsEn.length === 0) return null;
    return { phonetic, pos, definitionsEn, exampleEn };
}

async function fetchFromFreeDictionary(word: string, signal?: AbortSignal): Promise<FreeDictExtract | null> {
    const w = (word || '').trim().toLowerCase();
    if (!w) return null;
    // 多词短语（含空格）直接跳过——Free Dictionary 只收录单词
    if (/\s/.test(w)) return null;

    try {
        const res = await fetch(`${FREE_DICT_ENDPOINT}${encodeURIComponent(w)}`, {
            method: 'GET',
            signal,
        });
        if (!res.ok) return null; // 404 / 5xx 一律视为未命中
        const data = await res.json().catch(() => null);
        return extractFromFreeDict(data);
    } catch {
        return null;
    }
}

/**
 * 让 DeepSeek 仅做翻译工作：把 Free Dictionary 抽到的英文释义翻成中文 + 翻译例句。
 * 若无例句或词较偏，允许 AI 生成一句地道例句。
 */
async function translateFreeDictResult(
    word: string,
    extract: FreeDictExtract,
    context?: string
): Promise<StandardWordData> {
    const payload = {
        word,
        pos: extract.pos,
        definitionsEn: extract.definitionsEn,
        exampleEn: extract.exampleEn || null,
        context: context || null,
    };

    try {
        const data = await callProxy({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a precise English-to-Chinese translator. Translate concisely and return ONLY valid JSON.',
                },
                {
                    role: 'user',
                    content: `Below is dictionary data for an English word. Translate it into concise Chinese.

INPUT (JSON):
${JSON.stringify(payload, null, 2)}

Return a JSON object with EXACTLY this shape:
{
  "translationsZh": ["简短中文释义1", "简短中文释义2", ...],
  "exampleSentence": "one natural English example sentence (USE the provided exampleEn if it exists and is good; otherwise write a short new one)",
  "exampleTranslation": "该例句对应的地道中文翻译"
}

Rules:
1. translationsZh 的顺序必须与 definitionsEn 一一对应，长度相同
2. 每条中文释义不超过 10 个汉字，简洁准确
3. 不要输出解释、markdown、代码块，只输出 JSON 对象本身
4. 如果 context 提供了语境，优先参考它来选择释义用词`,
                },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
        }) as any;

        const raw = data?.choices?.[0]?.message?.content;
        if (typeof raw !== 'string' || !raw.trim()) {
            throw new Error('翻译接口返回为空');
        }

        const parsed = JSON.parse(raw);
        const zhList: string[] = Array.isArray(parsed?.translationsZh)
            ? parsed.translationsZh.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
            : [];
        const exampleSentence = String(parsed?.exampleSentence ?? '').trim() || extract.exampleEn;
        const exampleTranslation = String(parsed?.exampleTranslation ?? '').trim();

        if (zhList.length === 0) {
            throw new Error('翻译结果为空');
        }

        return {
            word,
            phonetic: extract.phonetic,
            pos: extract.pos,
            translation: zhList[0]!,
            exampleSentence,
            exampleTranslation,
            allDefinitions: zhList,
        };
    } catch (error) {
        // 翻译这一步挂了：至少把英文数据原样返回，也好过完全失败
        const reason = error instanceof Error ? error.message : '翻译失败';
        return {
            word,
            phonetic: extract.phonetic,
            pos: extract.pos,
            translation: `翻译暂不可用：${reason}`,
            exampleSentence: extract.exampleEn,
            exampleTranslation: '',
            allDefinitions: undefined,
        };
    }
}

// ─── 纯 AI 生成（降级路径，保留原逻辑） ───────────────────────────────────

async function fetchWordDetailsFromAi(
    word: string,
    context?: string
): Promise<StandardWordData> {
    try {
        const data = await callProxy({
            messages: [
                {
                    role: 'system',
                    content: 'You are an English dictionary expert. Return ONLY valid JSON.',
                },
                {
                    role: 'user',
                    content: `For the word "${word}"${context ? ` in context: "${context}"` : ''}, provide complete dictionary information in this exact JSON format:
{
    "word": "${word}",
    "phonetic": "IPA phonetic transcription",
    "pos": "part of speech (noun/verb/adjective/etc)",
    "translation": "concise Chinese translation (10 words max)",
    "exampleSentence": "natural English example sentence",
    "exampleTranslation": "Chinese translation of the example sentence"
}

Rules:
1. Phonetic must be in IPA format with slashes /ˈwɜːrd/
2. POS must be in English (noun, verb, adjective, etc.)
3. Translation must be concise and accurate
4. Example sentence must be natural and educational
5. All fields must be filled, no empty strings`,
                },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
        }) as any;

        const raw = data?.choices?.[0]?.message?.content;
        if (typeof raw !== 'string' || !raw.trim()) {
            return buildMinimalWordData(word, '查词接口返回为空');
        }

        let content: any = null;
        try {
            content = JSON.parse(raw);
        } catch {
            return buildMinimalWordData(word, '返回 JSON 解析失败');
        }

        const result: StandardWordData = {
            word: content.word || word,
            phonetic: content.phonetic || '',
            pos: content.pos || 'unknown',
            translation: content.translation || '',
            exampleSentence: content.exampleSentence || '',
            exampleTranslation: content.exampleTranslation || '',
        };

        if (!result.translation) {
            return buildMinimalWordData(word, '接口未返回 translation');
        }
        return result;
    } catch (error) {
        const reason = error instanceof Error ? error.message : '查词失败';
        return buildMinimalWordData(word, reason);
    }
}

// ─── 主入口：Free Dictionary 优先，失败降级到 AI ───────────────────────────

/**
 * 查词主入口。流程：
 * 1) 先尝试 Free Dictionary API（免费、无需 key、速度快）
 * 2) 命中则让 DeepSeek 仅做翻译工作（token 消耗大幅降低）
 * 3) 未命中则降级到全 AI 生成（与原实现一致）
 */
export async function fetchWordDetails(
    word: string,
    context?: string
): Promise<StandardWordData> {
    const w = (word || '').trim();
    if (!w) return buildMinimalWordData(word, '空词条');

    const extract = await fetchFromFreeDictionary(w);
    if (extract) {
        return translateFreeDictResult(w, extract, context);
    }
    return fetchWordDetailsFromAi(w, context);
}

// Helper function to convert existing WordBankItem to standardized format
export function standardizeWordItem(item: any): StandardWordData {
    return {
        word: item.text || item.word || '',
        phonetic: item.phonetic || '',
        pos: item.pos || '',
        translation: item.translation || '',
        exampleSentence: item.example || item.exampleSentence || '',
        exampleTranslation: item.exampleTranslation || '',
    };
}
