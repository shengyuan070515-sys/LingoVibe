/** 英文朗读：优先 Vercel `/api/tts`（Google Cloud TTS），失败则浏览器 speechSynthesis */

const MAX_CHARS = 4500;

let currentAudio: HTMLAudioElement | null = null;

function pickEnglishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
        voices.find(
            (v) =>
                v.lang === 'en-US' &&
                (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Microsoft'))
        ) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        null
    );
}

function speakBrowserEnglish(text: string): Promise<void> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            resolve();
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        const voice = pickEnglishVoice();
        if (voice) u.voice = voice;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
    });
}

/** 停止云端 MP3 与浏览器朗读 */
export function stopSpeakEnglish(): void {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

function ttsBaseUrl(): string {
    const base = import.meta.env.VITE_READING_API_BASE as string | undefined;
    if (base && /^https?:\/\//i.test(base.trim())) {
        return base.trim().replace(/\/$/, '');
    }
    return '';
}

/**
 * 朗读英文。成功用 GCP 音频时在本地 dev（无 /api）会回退浏览器。
 * Promise 在播放结束或出错时 resolve（不 reject，便于 UI finally）。
 */
export function speakEnglish(text: string): Promise<void> {
    const t = text.trim();
    if (!t || typeof window === 'undefined') return Promise.resolve();

    stopSpeakEnglish();

    const run = t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t;

    return (async () => {
        const root = ttsBaseUrl();
        const url = `${root}/api/tts`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: run }),
            });

            const ct = res.headers.get('content-type') || '';
            if (!res.ok || !ct.includes('audio')) {
                await speakBrowserEnglish(run);
                return;
            }

            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const audio = new Audio(objectUrl);
            currentAudio = audio;

            await new Promise<void>((resolve) => {
                const done = () => {
                    URL.revokeObjectURL(objectUrl);
                    if (currentAudio === audio) currentAudio = null;
                    resolve();
                };
                audio.onended = done;
                audio.onerror = done;
                void audio.play().catch(async () => {
                    await speakBrowserEnglish(run);
                    done();
                });
            });
        } catch {
            await speakBrowserEnglish(run);
        }
    })();
}
