import * as React from 'react';

type SpeechRecInstance = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start: () => void;
    stop: () => void;
    onresult: ((event: { resultIndex: number; results: { length: number; [i: number]: { [0]: { transcript: string }; isFinal: boolean } } }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
};

type SpeechRecCtor = new () => SpeechRecInstance;

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecCtor;
        webkitSpeechRecognition?: SpeechRecCtor;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** 浏览器英文听写（Web Speech API），用于微课 Step2 等 */
export function useEnglishSpeechRecognition(
    onFinal: (text: string) => void,
    onError?: (message: string) => void
) {
    const [listening, setListening] = React.useState(false);
    const recRef = React.useRef<SpeechRecInstance | null>(null);
    const onFinalRef = React.useRef(onFinal);
    onFinalRef.current = onFinal;

    const supported = getSpeechRecognitionCtor() !== null;

    const stop = React.useCallback(() => {
        try {
            recRef.current?.stop();
        } catch {
            /* ignore */
        }
        recRef.current = null;
        setListening(false);
    }, []);

    const start = React.useCallback(() => {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) {
            onError?.('当前浏览器不支持语音输入，请改用键盘输入');
            return;
        }
        stop();
        const rec = new Ctor();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.continuous = false;
        rec.onresult = (event) => {
            let text = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                text += event.results[i]![0]!.transcript;
            }
            const t = text.trim();
            if (t) onFinalRef.current(t);
        };
        rec.onerror = (e) => {
            if (e.error === 'aborted' || e.error === 'no-speech') {
                setListening(false);
                return;
            }
            setListening(false);
            onError?.(e.error === 'not-allowed' ? '请允许麦克风权限后再试' : '语音识别出错，请重试');
        };
        rec.onend = () => {
            setListening(false);
            recRef.current = null;
        };
        try {
            rec.start();
            recRef.current = rec;
            setListening(true);
        } catch {
            setListening(false);
            onError?.('无法启动语音识别');
        }
    }, [onError, stop]);

    const toggle = React.useCallback(() => {
        if (listening) stop();
        else start();
    }, [listening, start, stop]);

    React.useEffect(() => () => stop(), [stop]);

    return { listening, toggle, supported, stop, start };
}
