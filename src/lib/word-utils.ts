export interface StandardWordData {
    word: string;
    phonetic: string;
    pos: string;
    translation: string;
    exampleSentence: string;
    exampleTranslation: string;
}

export type WordBankKeyTestResult =
    | { ok: true }
    | { ok: false; message: string };

function safeGetWordBankApiKey(): string {
    try {
        const raw = localStorage.getItem('wordbank_api_key');
        if (typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        // useLocalStorage 会 JSON.stringify 存储字符串，因此这里优先 JSON.parse 还原
        try {
            const parsed = JSON.parse(trimmed);
            return typeof parsed === 'string' ? parsed.trim() : '';
        } catch {
            return trimmed;
        }
    } catch {
        return '';
    }
}

function buildAuthorizationHeader(rawKey: string): string {
    const k = (rawKey || '').trim();
    if (!k) return '';
    // 兼容用户直接粘贴 "Bearer xxx" 的情况，避免重复 Bearer
    if (/^bearer\s+/i.test(k)) return k;
    return `Bearer ${k}`;
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
        exampleTranslation: ''
    };
}

export async function testWordBankApiKey(rawKey: string): Promise<WordBankKeyTestResult> {
    const apiKey = (rawKey || '').trim();
    if (!apiKey) return { ok: false, message: '未填写生词本专属 API Key' };

    const controller = new AbortController();
    const timeoutMs = 12000;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': buildAuthorizationHeader(apiKey),
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: 'Return ONLY JSON.' },
                    { role: 'user', content: 'Reply with {"ok": true}.' },
                ],
                response_format: { type: 'json_object' },
                temperature: 0,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            let serverMessage = '';
            try {
                const err = await response.json();
                serverMessage = err?.error?.message || err?.message || '';
            } catch {
                // ignore
            }
            const msg = serverMessage ? `${response.status} ${serverMessage}` : `${response.status}`;
            return { ok: false, message: msg };
        }

        return { ok: true };
    } catch (error) {
        const reason =
            error instanceof DOMException && error.name === 'AbortError'
                ? '请求超时'
                : '请求失败（网络或跨域）';
        return { ok: false, message: reason };
    } finally {
        window.clearTimeout(timer);
    }
}

export async function fetchWordDetails(
    word: string, 
    context?: string
): Promise<StandardWordData> {
    // 生词本的查词请求：强制使用设置里的「生词本专属」API Key（与其他模块互不影响）
    const apiKey = safeGetWordBankApiKey();
    
    if (!apiKey) {
        console.warn("[WordUtils] No WordBank API key available, returning fallback data");
        return getFallbackWordData(word, "未设置生词本专属 API Key");
    }

    try {
        console.debug("[WordUtils] Fetching word details with WordBank key", { word, hasContext: !!context });
        const controller = new AbortController();
        const timeoutMs = 12000;
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': buildAuthorizationHeader(apiKey),
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are an English dictionary expert. Return ONLY valid JSON.` 
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
                        5. All fields must be filled, no empty strings`
                    }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3
            }),
            signal: controller.signal
        });
        window.clearTimeout(timer);

        if (!response.ok) {
            let serverMessage = '';
            try {
                const err = await response.json();
                serverMessage = err?.error?.message || err?.message || '';
            } catch {
                // ignore
            }
            const msg = serverMessage ? `${response.status} ${serverMessage}` : `${response.status}`;
            return buildMinimalWordData(word, `查词接口错误：${msg}`);
        }

        const data = await response.json();
        const raw = data?.choices?.[0]?.message?.content;
        if (typeof raw !== 'string' || raw.trim() === '') {
            return buildMinimalWordData(word, "查词接口返回为空");
        }

        let content: any = null;
        try {
            content = JSON.parse(raw);
        } catch {
            return buildMinimalWordData(word, "返回 JSON 解析失败");
        }
        
        // Validate and ensure all fields are present
        const result: StandardWordData = {
            word: content.word || word,
            phonetic: content.phonetic || '',
            pos: content.pos || 'unknown',
            translation: content.translation || '',
            exampleSentence: content.exampleSentence || '',
            exampleTranslation: content.exampleTranslation || ''
        };
        if (!result.translation) {
            return buildMinimalWordData(word, "接口未返回 translation");
        }
        return result;

    } catch (error) {
        console.error("[WordUtils] Failed to fetch word details:", error);
        const reason =
            error instanceof DOMException && error.name === 'AbortError'
                ? '查词超时'
                : '查词失败';
        return buildMinimalWordData(word, reason);
    }
}

function getFallbackWordData(word: string, reason?: string): StandardWordData {
    // Simple fallback data for common words
    const fallbacks: Record<string, StandardWordData> = {
        'hello': {
            word: 'hello',
            phonetic: '/həˈloʊ/',
            pos: 'interjection',
            translation: '你好，喂',
            exampleSentence: 'Hello, how are you today?',
            exampleTranslation: '你好，今天怎么样？'
        },
        'world': {
            word: 'world',
            phonetic: '/wɜːrld/',
            pos: 'noun',
            translation: '世界',
            exampleSentence: 'The world is full of possibilities.',
            exampleTranslation: '世界充满了可能性。'
        },
        'learn': {
            word: 'learn',
            phonetic: '/lɜːrn/',
            pos: 'verb',
            translation: '学习',
            exampleSentence: 'I want to learn English.',
            exampleTranslation: '我想学习英语。'
        }
    };

    const hit = fallbacks[word.toLowerCase()];
    return hit || buildMinimalWordData(word, reason);
}

// Helper function to convert existing WordBankItem to standardized format
export function standardizeWordItem(item: any): StandardWordData {
    return {
        word: item.text || item.word || '',
        phonetic: item.phonetic || '',
        pos: item.pos || '',
        translation: item.translation || '',
        exampleSentence: item.example || item.exampleSentence || '',
        exampleTranslation: item.exampleTranslation || ''
    };
}