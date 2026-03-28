/**
 * 发音评估：优先调用 VITE_PRONUNCIATION_API_URL（POST multipart: audio + referenceText），
 * 未配置时在支持 Web Speech API 的浏览器内用语音识别 + 文本比对生成参考分数与薄弱词。
 */

export type WordAssessment = {
    word: string;
    accuracy: number;
    ok: boolean;
};

export type PronunciationResult = {
    fluencyScore: number;
    accuracyScore: number;
    stressScore: number;
    transcript: string;
    words: WordAssessment[];
    weakWords: string[];
    source: 'api' | 'speech-recognition' | 'mock';
};

export function splitIntoSentences(text: string): string[] {
    if (!text.trim()) return [];
    const normalized = text.replace(/\s+/g, ' ').trim();
    const parts = normalized
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length ? parts : [normalized];
}

export function tokenizeWords(text: string): string[] {
    const m = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
    return m ?? [];
}

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

function wordSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return 1 - dist / maxLen;
}

/** 顺序对齐参考词与用户识别词，标出薄弱词（缺读、错读）。 */
export function compareReferenceToTranscript(reference: string, transcript: string): Pick<PronunciationResult, 'words' | 'weakWords' | 'fluencyScore' | 'accuracyScore' | 'stressScore'> {
    const ref = tokenizeWords(reference);
    const hyp = tokenizeWords(transcript);

    if (ref.length === 0) {
        return {
            words: [],
            weakWords: [],
            fluencyScore: 0,
            accuracyScore: 0,
            stressScore: 0,
        };
    }

    const SIM_THRESHOLD = 0.72;
    const words: WordAssessment[] = [];
    const weakWords: string[] = [];
    let j = 0;
    let matchedWeight = 0;

    for (let i = 0; i < ref.length; i++) {
        const rw = ref[i];
        let bestSim = 0;
        let bestJ = -1;
        const windowEnd = Math.min(j + 4, hyp.length);
        for (let k = j; k < windowEnd; k++) {
            const sim = wordSimilarity(rw, hyp[k]);
            if (sim > bestSim) {
                bestSim = sim;
                bestJ = k;
            }
        }

        if (bestJ >= 0 && bestSim >= SIM_THRESHOLD) {
            const acc = clamp(Math.round(bestSim * 100), 55, 100);
            const ok = bestSim >= 0.88;
            words.push({ word: rw, accuracy: acc, ok });
            if (!ok) weakWords.push(rw);
            matchedWeight += bestSim;
            j = bestJ + 1;
        } else {
            words.push({ word: rw, accuracy: clamp(Math.round(bestSim * 100), 25, 55), ok: false });
            weakWords.push(rw);
        }
    }

    const coverage = matchedWeight / ref.length;
    const fluencyScore = clamp(Math.round(coverage * 92 + (hyp.length > 0 ? 4 : 0)), 0, 100);
    const accuracyScore = clamp(Math.round(coverage * 100), 0, 100);
    const stressScore = clamp(Math.round(accuracyScore * 0.94 + (hyp.length >= ref.length ? 3 : -4)), 0, 100);

    return { words, weakWords, fluencyScore, accuracyScore, stressScore };
}

export function buildResultFromTranscript(reference: string, transcript: string): PronunciationResult {
    const t = transcript.trim();
    if (!t) {
        const refToks = tokenizeWords(reference);
        return {
            fluencyScore: 0,
            accuracyScore: 0,
            stressScore: 0,
            transcript: '',
            words: refToks.map((w) => ({ word: w, accuracy: 0, ok: false })),
            weakWords: refToks,
            source: 'speech-recognition',
        };
    }
    const cmp = compareReferenceToTranscript(reference, t);
    return {
        ...cmp,
        transcript: t,
        source: 'speech-recognition',
    };
}

function getPronunciationApiUrl(): string | undefined {
    const v = import.meta.env.VITE_PRONUNCIATION_API_URL;
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

export async function assessPronunciationFromApi(audioBlob: Blob, referenceText: string): Promise<PronunciationResult> {
    const url = getPronunciationApiUrl();
    if (!url) throw new Error('未配置 VITE_PRONUNCIATION_API_URL');

    const fd = new FormData();
    fd.append('audio', audioBlob, audioBlob.type.includes('webm') ? 'recording.webm' : 'recording.wav');
    fd.append('referenceText', referenceText);

    const res = await fetch(url, { method: 'POST', body: fd });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = (raw as { error?: string }).error || res.statusText || '发音评估请求失败';
        throw new Error(msg);
    }

    const data = raw as Record<string, unknown>;
    const fluencyScore = Number(data.fluencyScore ?? data.fluency ?? (data.overall as Record<string, unknown>)?.fluency ?? 85);
    const accuracyScore = Number(data.accuracyScore ?? data.accuracy ?? (data.overall as Record<string, unknown>)?.accuracy ?? fluencyScore);
    const stressScore = Number(data.stressScore ?? data.stress ?? accuracyScore - 3);

    const transcript = String(data.transcript ?? data.text ?? '');

    let words: WordAssessment[] = [];
    const weakWords: string[] = [];

    const wordList = data.words as unknown;
    if (Array.isArray(wordList)) {
        words = wordList.map((w: Record<string, unknown>) => {
            const word = String(w.word ?? w.text ?? '');
            const accuracy = Number(w.accuracy ?? w.score ?? 80);
            const ok = w.ok !== undefined ? Boolean(w.ok) : accuracy >= 80;
            if (!ok && word) weakWords.push(word.toLowerCase().replace(/[^a-z']/g, ''));
            return { word: word.toLowerCase().replace(/[^a-z']/g, ''), accuracy: clamp(accuracy, 0, 100), ok };
        });
    }

    if (words.length === 0 && transcript) {
        return { ...buildResultFromTranscript(referenceText, transcript), fluencyScore, accuracyScore, stressScore, source: 'api' };
    }

    if (words.length === 0) {
        const fb = buildResultFromTranscript(referenceText, referenceText);
        return { ...fb, fluencyScore, accuracyScore, stressScore, source: 'api' };
    }

    return {
        fluencyScore: clamp(fluencyScore, 0, 100),
        accuracyScore: clamp(accuracyScore, 0, 100),
        stressScore: clamp(stressScore, 0, 100),
        transcript,
        words,
        weakWords: weakWords.length ? weakWords : words.filter((x) => !x.ok).map((x) => x.word),
        source: 'api',
    };
}

export function isSpeechRecognitionSupported(): boolean {
    return Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
        || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

/** 按住期间 continuous 识别，松开后 resolve 完整转写文本 */
export function startSpeechHoldSession(): {
    start: () => void;
    stop: () => Promise<string>;
    abort: () => void;
} {
    type SpeechRecCtor = new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((ev: any) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
    };

    const win = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!Ctor) {
        return {
            start: () => {},
            stop: () => Promise.resolve(''),
            abort: () => {},
        };
    }

    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    let buffer = '';
    let interim = '';

    rec.onresult = (event: any) => {
        interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            const piece = r[0]?.transcript ?? '';
            if (r.isFinal) buffer += piece + ' ';
            else interim += piece;
        }
    };

    let stoppedResolver: ((v: string) => void) | null = null;

    rec.onend = () => {
        const out = (buffer + interim).replace(/\s+/g, ' ').trim();
        stoppedResolver?.(out);
        stoppedResolver = null;
    };

    return {
        start: () => {
            buffer = '';
            interim = '';
            try {
                rec.start();
            } catch {
                /* already started */
            }
        },
        stop: () =>
            new Promise<string>((resolve) => {
                const textNow = () => (buffer + interim).replace(/\s+/g, ' ').trim();
                stoppedResolver = resolve;
                try {
                    rec.stop();
                } catch {
                    resolve(textNow());
                    stoppedResolver = null;
                }
                window.setTimeout(() => {
                    if (stoppedResolver) {
                        resolve(textNow());
                        stoppedResolver = null;
                    }
                }, 2500);
            }),
        abort: () => {
            try {
                rec.abort();
            } catch {
                /* noop */
            }
        },
    };
}

export { getPronunciationApiUrl };
