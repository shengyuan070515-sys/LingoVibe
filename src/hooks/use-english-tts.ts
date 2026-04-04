import * as React from 'react';

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

/** 浏览器英文 TTS（首页或阅读等复用） */
export function useEnglishTts(text: string) {
    const [isPlaying, setIsPlaying] = React.useState(false);
    const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

    const stop = React.useCallback(() => {
        if (!synth) return;
        synth.cancel();
        utteranceRef.current = null;
        setIsPlaying(false);
    }, [synth]);

    const pause = React.useCallback(() => {
        if (!synth) return;
        synth.pause();
        setIsPlaying(false);
    }, [synth]);

    const play = React.useCallback(() => {
        if (!synth || !text.trim()) return;
        if (synth.paused && utteranceRef.current) {
            synth.resume();
            setIsPlaying(true);
            return;
        }
        stop();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        const voice = pickEnglishVoice();
        if (voice) utterance.voice = voice;
        utterance.onstart = () => setIsPlaying(true);
        utterance.onend = () => {
            utteranceRef.current = null;
            setIsPlaying(false);
        };
        utterance.onerror = () => {
            utteranceRef.current = null;
            setIsPlaying(false);
        };
        utteranceRef.current = utterance;
        synth.speak(utterance);
    }, [synth, text, stop]);

    const toggle = React.useCallback(() => {
        if (isPlaying) pause();
        else play();
    }, [isPlaying, pause, play]);

    React.useEffect(() => {
        const loadVoices = () => pickEnglishVoice();
        if (synth && synth.getVoices().length === 0) {
            synth.addEventListener('voiceschanged', loadVoices);
            return () => synth.removeEventListener('voiceschanged', loadVoices);
        }
        return undefined;
    }, [synth]);

    React.useEffect(() => () => stop(), [stop]);

    return { isPlaying, play, pause, stop, toggle };
}
