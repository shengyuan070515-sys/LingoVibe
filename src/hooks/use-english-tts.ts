import * as React from 'react';
import { speakEnglish, stopSpeakEnglish } from '@/lib/speak-english';

/** 英文朗读（Cloud TTS + 浏览器回退），与 `speakEnglish` 同源 */
export function useEnglishTts(text: string) {
    const [isPlaying, setIsPlaying] = React.useState(false);

    const stop = React.useCallback(() => {
        stopSpeakEnglish();
        setIsPlaying(false);
    }, []);

    const play = React.useCallback(() => {
        if (!text.trim()) return;
        stopSpeakEnglish();
        setIsPlaying(true);
        void speakEnglish(text).finally(() => setIsPlaying(false));
    }, [text]);

    const pause = React.useCallback(() => {
        stop();
    }, [stop]);

    const toggle = React.useCallback(() => {
        if (isPlaying) stop();
        else play();
    }, [isPlaying, stop, play]);

    React.useEffect(() => () => stop(), [stop]);

    return { isPlaying, play, pause, stop, toggle };
}
