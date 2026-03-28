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
    
    Format your response strictly as follows:
    [CORRECTION]你的中文纠错内容写在这里（如果没有错误，则完全省略此标签）[/CORRECTION]
    [CONTENT]Your concise, natural English response here[/CONTENT]
    [TRANSLATION]你的中文翻译写在这里[/TRANSLATION]`,
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

function pickVocabularyWords(words: WordBankItem[], max: number): string[] {
    const list = words.filter((w) => w.type === 'word').map((w) => w.word.trim()).filter(Boolean);
    if (list.length === 0) return [];
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(max, shuffled.length));
}

function buildOpeningUserInstruction(
    mode: ChatMode,
    words: WordBankItem[],
    now: Date
): string {
    const hour = now.getHours();
    const bucket = getTimeBucket(hour);
    const picked = pickVocabularyWords(words, 5);
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
        return `[OPENING MODE: VOCABULARY — WORD BANK]
The learner recently saved or is reviewing these English words from their personal word list: ${picked.join(', ')}.
As Emma, send ONE natural first message in English that creatively references at least one of these words (you may combine two for a fun image, e.g. "spicy watermelon"). Ask ONE engaging follow-up question in English (e.g. about taste, habits, or imagination).
Stay playful and supportive.`;
    }

    if (mode === 'casual') {
        return `[OPENING MODE: CASUAL CHECK-IN]
${timeHints[bucket]}
Write ONE short first message in English like a pen pal — no study pressure, no word lists. Ask ONE simple question about their day or mood.`;
    }

    // surprise
    return `[OPENING MODE: SURPRISE — YOU CHOOSE]
Either (A) use some of these words if any exist: ${picked.length ? picked.join(', ') : '(none)'} in a creative opener, OR (B) ${timeHints[bucket]} for a pure casual opener.
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

/** 主动开场：仅一条 user instruction + 同一套 system prompt，使用与对话相同的 DeepSeek Key */
export async function fetchProactiveOpening(
    apiKey: string,
    mode: ChatMode,
    words: WordBankItem[]
): Promise<{ correction?: string; content: string; translation?: string }> {
    const instruction = buildOpeningUserInstruction(mode, words, new Date());
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                emmaSystemPrompt,
                {
                    role: 'user',
                    content: `${instruction}\n\nThis is the FIRST message of a new chat — no user message yet. Output ONLY the three tags [CORRECTION] (omit if none), [CONTENT], [TRANSLATION] as usual.`,
                },
            ],
        }),
    });
    if (!response.ok) throw new Error('Opening request failed');
    const data = await response.json();
    const raw = data.choices[0].message.content as string;
    return parseEmmaResponse(raw);
}
