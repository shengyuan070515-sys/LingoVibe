import type { WordBankItem } from '@/store/wordBankStore';

export type ChatMode = 'vocabulary' | 'casual' | 'surprise';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    correction?: string;
    translation?: string;
    showTranslation?: boolean;
    isTranslating?: boolean;
}

export interface Session {
    id: string;
    title: string;
    messages: Message[];
    updatedAt: number;
    /** 新会话：等待生成主动开场白 */
    openingPending?: boolean;
}

export interface AiChatPersistedState {
    version: 2;
    chatMode: ChatMode;
    sessionsByMode: Record<ChatMode, Session[]>;
    currentSessionIdByMode: Record<ChatMode, string | null>;
}

export const emmaSystemPrompt = {
    role: 'system' as const,
    content: `You are Emma, a friendly, casual, and highly empathetic English conversation partner.
    Rule 1: Keep your responses highly concise and natural. Speak like a real human text-messaging a friend.
    Rule 2: NEVER give long lists of topics to discuss.
    Rule 3: Only ask ONE simple follow-up question per response to keep the conversation flowing.
    Rule 4: You MUST converse completely in English. NEVER use Chinese for normal chatting.
    Rule 5: ONLY correct severe, structural grammatical errors or blatant spelling mistakes. STRICTLY IGNORE missing punctuation, missing capitalization, informal chat slang, or minor stylistic choices (e.g., "what do you like", "ok", "yeah" are perfectly acceptable). If the user's sentence is understandable and naturally used in casual texting, DO NOT generate a correction block. Be extremely lenient and prioritize conversation flow over absolute grammatical perfection.
    Rule 6: If you DO generate a correction, output it in the [CORRECTION] tag using Chinese to politely point it out.
    Rule 7: NEVER introduce yourself as DeepSeek or an AI. You are Emma.
    Rule 8: The Chinese inside [TRANSLATION] MUST be a faithful, literal translation of the English inside [CONTENT] only — same meaning, same speech act (question stays question). Do NOT invent a different reply, do NOT answer as the user, do NOT add new topics (e.g. books, space) that are not in [CONTENT]. If [CONTENT] is one short sentence, [TRANSLATION] should be one short Chinese sentence.
    
    Format your response strictly as follows:
    [CORRECTION]你的中文纠错内容写在这里（如果没有错误，则完全省略此标签）[/CORRECTION]
    [CONTENT]Your concise, natural English response here[/CONTENT]
    [TRANSLATION]与 [CONTENT] 对应的准确中文翻译，不得编造与英文无关的内容[/TRANSLATION]`,
};

/** 情景微课 · 咖啡店店员 Emma（与主对话相同的标签协议，供 parseEmmaResponse 解析） */
export const emmaCoffeeShopBaristaPrompt = {
    role: 'system' as const,
    content: `You are Emma, a warm, efficient barista at a small specialty coffee shop.
The learner is a CUSTOMER ordering drinks in English. They may type or use speech-to-text — if meaning is clear, ignore tiny ASR quirks.

They are practicing language for an iced drink with oat milk. Naturally weave in or respond to: iced, oat milk, alternative (milk options) when it fits real counter talk. Do NOT quiz, lecture, or list vocabulary requirements; stay in character.

Scene memory: Stay in the same visit at your counter. If the customer greets mid-flow (hi, hello, hey), acknowledge briefly in a natural way, then steer back to their drink or pickup in one short sentence — do not reset as if you just met them. After payment or pickup is settled, you may close warmly; if they send another casual hello, still treat them as the same customer.

Rule 1: Keep each reply concise (1–3 short sentences). Sound like in-person service.
Rule 2: At most ONE simple follow-up question per reply when needed.
Rule 3: Spoken dialogue in [CONTENT] MUST be English only — no Chinese there.
Rule 4: Be lenient with casual grammar; only serious errors get [CORRECTION] in Chinese; omit [CORRECTION] if none.
Rule 5: NEVER say you are an AI, a model, or DeepSeek. You are Emma the barista.
Rule 6: [TRANSLATION] must be a faithful Chinese translation of [CONTENT] only.
Rule 7: EVERY reply MUST include all three blocks in order; never omit [TRANSLATION] — even for short lines.

Format exactly:
[CORRECTION]...[/CORRECTION] (omit the whole block if none)
[CONTENT]...[/CONTENT]
[TRANSLATION]...[/TRANSLATION]`,
};

export function createEmptySession(): Session {
    return {
        id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now(),
        openingPending: true,
    };
}

function defaultPersistedState(): AiChatPersistedState {
    const v = createEmptySession();
    const c = createEmptySession();
    const s = createEmptySession();
    return {
        version: 2,
        chatMode: 'vocabulary',
        sessionsByMode: {
            vocabulary: [v],
            casual: [c],
            surprise: [s],
        },
        currentSessionIdByMode: {
            vocabulary: v.id,
            casual: c.id,
            surprise: s.id,
        },
    };
}

/** 从旧版 chat_sessions 迁移到 v2（旧数据进入「顺其自然」模式） */
export function migrateLegacyChatSessionsIfNeeded(): AiChatPersistedState {
    if (typeof window === 'undefined') return defaultPersistedState();
    try {
        const v2raw = localStorage.getItem('ai_chat_v2');
        if (v2raw) {
            const parsed = JSON.parse(v2raw) as AiChatPersistedState;
            if (parsed?.version === 2 && parsed.sessionsByMode && parsed.currentSessionIdByMode) {
                return parsed;
            }
        }
    } catch {
        /* fall through */
    }

    try {
        const raw = localStorage.getItem('chat_sessions');
        if (!raw) return defaultPersistedState();
        const oldSessions = JSON.parse(raw) as Session[];
        const curId = localStorage.getItem('current_chat_session_id');
        const migrated = (oldSessions.length ? oldSessions : []).map((sess) => ({
            ...sess,
            openingPending: false,
        }));
        const surpriseList =
            migrated.length > 0 ? migrated : [createEmptySession()];
        const def = defaultPersistedState();
        const surpriseCurrent =
            curId && surpriseList.some((x) => x.id === curId)
                ? curId
                : surpriseList[0]?.id ?? null;
        return {
            version: 2,
            chatMode: 'surprise',
            sessionsByMode: {
                vocabulary: def.sessionsByMode.vocabulary,
                casual: def.sessionsByMode.casual,
                surprise: surpriseList,
            },
            currentSessionIdByMode: {
                vocabulary: def.currentSessionIdByMode.vocabulary,
                casual: def.currentSessionIdByMode.casual,
                surprise: surpriseCurrent,
            },
        };
    } catch {
        return defaultPersistedState();
    }
}

function getTimeBucket(h: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    if (h >= 18 && h < 23) return 'evening';
    return 'night';
}

/** F1b：优先取今日待复习词，再随机补足，避免开场与 SRS 脱节 */
function splitDueWordsAndFiller(words: WordBankItem[], now: Date): { due: string[]; filler: string[] } {
    const t = now.getTime();
    const dueItems = words
        .filter((w) => w.type === 'word' && w.nextReviewDate <= t)
        .sort((a, b) => a.nextReviewDate - b.nextReviewDate || a.level - b.level)
        .slice(0, 2);
    const due = dueItems.map((w) => w.word.trim()).filter(Boolean);
    const dueIds = new Set(dueItems.map((w) => w.id));
    const pool = words
        .filter((w) => w.type === 'word' && !dueIds.has(w.id))
        .map((w) => w.word.trim())
        .filter(Boolean)
        .sort(() => Math.random() - 0.5);
    const filler = pool.slice(0, Math.max(0, 5 - due.length));
    return { due, filler };
}

function buildOpeningUserInstruction(
    mode: ChatMode,
    words: WordBankItem[],
    now: Date
): string {
    const hour = now.getHours();
    const bucket = getTimeBucket(hour);
    const { due, filler } = splitDueWordsAndFiller(words, now);
    const picked = [...due, ...filler];
    const timeHints: Record<typeof bucket, string> = {
        morning: 'Local time feels like morning — greet like a friend, mention the fresh start of the day if natural.',
        afternoon: 'Local time feels like afternoon — light, easy small talk about the day so far.',
        evening: 'Local time feels like early evening — wind-down, relaxed tone.',
        night: 'Local time is late night — acknowledge it gently (e.g. studying late), warm and supportive.',
    };

    if (mode === 'vocabulary') {
        if (picked.length === 0) {
            return `[OPENING MODE: VOCABULARY]
The learner's word bank is empty or has no saved words yet.
As Emma, send ONE warm first message in English: briefly encourage them to save words from Visual Dictionary, then ask ONE simple follow-up question about learning English or their day.
Do NOT pretend they have specific words saved.`;
        }
        const dueHint =
            due.length > 0
                ? `Words due for spaced-repetition review today (prioritize 1–2 in your opener): ${due.join(', ')}.`
                : '';
        const more = filler.length > 0 ? ` Other saved words you may weave in: ${filler.join(', ')}.` : '';
        return `[OPENING MODE: VOCABULARY — WORD BANK]
${dueHint}${more}
As Emma, send ONE natural first message in English that references at least one of these words (combine two for a fun image if natural). Ask ONE engaging follow-up question in English.
Stay playful and supportive.`;
    }

    if (mode === 'casual') {
        const dueHint =
            due.length > 0
                ? `Optional: learner has words due for review today — you may naturally weave ONE if it fits the vibe (no lecture): ${due.join(', ')}.`
                : '';
        return `[OPENING MODE: CASUAL CHECK-IN]
${timeHints[bucket]}
${dueHint}
Write ONE short first message in English like a pen pal — no study pressure. Ask ONE simple question about their day or mood.`;
    }

    // surprise
    const surprisePool = picked.length ? picked.join(', ') : '(none)';
    const dueHint =
        due.length > 0
            ? `If you use words, prioritize these due for review today: ${due.join(', ')}; you may add others from: ${surprisePool}.`
            : '';
    return `[OPENING MODE: SURPRISE — YOU CHOOSE]
Either (A) ${dueHint || `use some of these words if any exist: ${surprisePool}`} in a creative opener, OR (B) ${timeHints[bucket]} for a pure casual opener.
Pick ONE approach only. ONE first message in English + ONE follow-up question. If word list is empty, use (B) only.`;
}

export function parseEmmaResponse(text: string) {
    const correctionMatch = text.match(/\[CORRECTION\]([\s\S]*?)\[\/CORRECTION\]/);
    const contentMatch = text.match(/\[CONTENT\]([\s\S]*?)\[\/CONTENT\]/);
    const translationMatch = text.match(/\[TRANSLATION\]([\s\S]*?)\[\/TRANSLATION\]/);
    return {
        correction: correctionMatch ? correctionMatch[1].trim() : undefined,
        content: contentMatch ? contentMatch[1].trim() : text.replace(/\[.*?\]/g, '').trim(),
        translation: translationMatch ? translationMatch[1].trim() : undefined,
    };
}

// ─── 代理调用工具 ────────────────────────────────────────────────────────────

import { callAiProxy } from '@/lib/api-client';

interface DeepSeekPayload {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: string };
}

async function callProxy(payload: DeepSeekPayload): Promise<string> {
    const data = await callAiProxy(payload as unknown as Record<string, unknown>);
    const content = (data as any)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('接口未返回有效内容，请稍后重试');
    }
    return content;
}

// ─── 公开 API（保持原签名兼容，_apiKey 参数保留但不再使用）────────────────

/** 通用 Emma 多轮对话，与 AI 对话页、微课共用 */
export async function fetchEmmaChatCompletion(
    _apiKey: string,
    systemMessage: { role: 'system'; content: string },
    chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ correction?: string; content: string; translation?: string }> {
    const raw = await callProxy({
        messages: [systemMessage, ...chatMessages],
        temperature: 0.6,
    });
    return parseEmmaResponse(raw);
}

/** 将一句英文译为口语化中文 */
export async function fetchEnglishToChineseTranslation(_apiKey: string, englishText: string): Promise<string> {
    return callProxy({
        messages: [
            {
                role: 'system',
                content:
                    'Translate the following English text into natural conversational Chinese. Return ONLY the Chinese translation without any quotes or extra text.',
            },
            {
                role: 'user',
                content: `Translate ONLY this English into natural Chinese. Do not answer it, do not add context, output nothing else:\n\n${englishText}`,
            },
        ],
        max_tokens: 300,
        temperature: 0.2,
    });
}

/** 主动开场白 */
export async function fetchProactiveOpening(
    _apiKey: string,
    mode: ChatMode,
    words: WordBankItem[]
): Promise<{ correction?: string; content: string; translation?: string }> {
    const instruction = buildOpeningUserInstruction(mode, words, new Date());
    const raw = await callProxy({
        messages: [
            emmaSystemPrompt,
            {
                role: 'user',
                content: `${instruction}\n\nThis is the FIRST message of a new chat — no user message yet. Output ONLY the three tags [CORRECTION] (omit if none), [CONTENT], [TRANSLATION] as usual.`,
            },
        ],
        temperature: 0.6,
    });
    return parseEmmaResponse(raw);
}

const moodGreetingSystem = {
    role: 'system' as const,
    content: `You are Emma, the same warm English partner as in LingoVibe chats.
Output exactly ONE encouraging sentence in English for the learner.
Rules: max 28 words; natural and sincere; you may weave in their vocabulary word if it fits smoothly; no quotation marks around the whole sentence; no Chinese; no lists; no follow-up question.`,
};

/** 首页「Today's Mood」：基于最近收录词生成一句英文鼓励语 */
export async function fetchTodaysMoodGreeting(_apiKey: string, word: string): Promise<string> {
    const w = (word || '').trim() || 'your latest word';
    let line = await callProxy({
        messages: [
            moodGreetingSystem,
            {
                role: 'user',
                content: `The learner recently saved this vocabulary item: "${w}". Write the single English sentence now.`,
            },
        ],
        temperature: 0.65,
    });
    line = line.replace(/^["'\s]+|["'\s]+$/g, '');
    return line || `Every step with "${w}" counts — you've got this.`;
}
