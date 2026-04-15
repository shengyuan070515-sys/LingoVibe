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

export async function fetchWordDetails(
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
        const reason =
            error instanceof Error ? error.message : '查词失败';
        return buildMinimalWordData(word, reason);
    }
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
