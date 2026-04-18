import * as React from 'react';
import { BookMarked, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VisualDictionaryCardBody } from '@/components/reading/visual-dictionary-card-body';
import { fetchReadingWordCard, type ReadingWordCardData } from '@/lib/reading-ai';
import { fetchUnsplashImages } from '@/lib/unsplash';
import { speakEnglish } from '@/lib/speak-english';

export interface ReadingWordCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    word: string;
    contextSnippet: string;
    articleContextLabel: string;
    onAddToWordBank: (data: ReadingWordCardData) => void | Promise<void>;
}

export function ReadingWordCardModal({
    isOpen,
    onClose,
    word,
    contextSnippet,
    articleContextLabel,
    onAddToWordBank,
}: ReadingWordCardModalProps) {
    const modalRef = React.useRef<HTMLDivElement>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [data, setData] = React.useState<ReadingWordCardData | null>(null);
    const [heroUrls, setHeroUrls] = React.useState<string[]>([]);
    const [activeImageIndex, setActiveImageIndex] = React.useState(0);
    const [isSpeaking, setIsSpeaking] = React.useState(false);
    const [adding, setAdding] = React.useState(false);

    React.useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setData(null);
        setHeroUrls([]);
        setActiveImageIndex(0);
        const w = word.trim();
        if (!w) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const card = await fetchReadingWordCard(w, contextSnippet);
                if (cancelled) return;
                setData(card);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : '查词失败');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, word, contextSnippet]);

    React.useEffect(() => {
        if (!isOpen || !data) return;
        const w = word.trim();
        if (!w) return;
        let cancelled = false;
        fetchUnsplashImages(w, { perPage: 4 })
            .then((urls) => {
                if (!cancelled && urls.length > 0) setHeroUrls(urls);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isOpen, word, data]);

    React.useEffect(() => {
        if (!isOpen) return;
        const t = window.setInterval(() => {
            setActiveImageIndex((prev) => (heroUrls.length > 1 ? (prev + 1) % heroUrls.length : 0));
        }, 4500);
        return () => window.clearInterval(t);
    }, [isOpen, heroUrls.length]);

    React.useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === modalRef.current) onClose();
    };

    const playWord = () => {
        setIsSpeaking(true);
        void speakEnglish(word).finally(() => setIsSpeaking(false));
    };

    if (!isOpen) return null;

    const hero = heroUrls[activeImageIndex] ?? heroUrls[0];
    const showBody = data && !loading && !error;

    return (
        <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={word ? `查词：${word}` : '查词卡片'}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
                {hero ? (
                    <div className="relative h-[200px] w-full overflow-hidden bg-white">
                        <img
                            src={hero}
                            alt=""
                            className="h-full w-full scale-[1.07] object-cover brightness-[0.94] saturate-[0.94] transition-transform duration-[9000ms] ease-out"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/5 via-transparent to-black/8" />
                        <div
                            className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(100%,12.5rem)] min-h-[120px] max-h-[200px]"
                            style={{
                                background:
                                    'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.02) 10%, rgba(255,255,255,0.08) 24%, rgba(255,255,255,0.22) 40%, rgba(255,255,255,0.48) 55%, rgba(255,255,255,0.72) 68%, rgba(255,255,255,0.85) 78%, rgba(255,255,255,0.94) 90%, #ffffff 100%)',
                            }}
                        />
                        <div className="absolute bottom-5 left-4 right-4 z-10 flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                                VISUAL DICTIONARY
                            </div>
                            {heroUrls.length > 1 ? (
                                <div className="flex items-center gap-1.5">
                                    {heroUrls.slice(0, 4).map((u, idx) => (
                                        <button
                                            key={u}
                                            type="button"
                                            onClick={() => setActiveImageIndex(idx)}
                                            className={[
                                                'h-7 w-7 overflow-hidden rounded-lg border transition-all',
                                                idx === activeImageIndex ? 'border-white shadow' : 'border-white/40 opacity-80 hover:opacity-100',
                                            ].join(' ')}
                                        >
                                            <img src={u} alt="" className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="h-6" />
                )}

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭"
                    className="absolute right-4 top-4 text-gray-400 transition-colors hover:text-gray-600"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="relative z-20 -mt-px bg-white p-8 pt-6">
                    {loading ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-sm text-gray-500">
                            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                            正在生成词典卡片…
                        </div>
                    ) : error ? (
                        <p className="py-8 text-center text-sm text-red-600">{error}</p>
                    ) : null}

                    {showBody && data ? (
                        <>
                            <VisualDictionaryCardBody
                                word={word.trim()}
                                phonetic={data.phonetic}
                                pos={data.pos}
                                translation={data.definitionZh}
                                exampleSentence={data.exampleEn}
                                exampleTranslation={data.exampleZh}
                                isSpeaking={isSpeaking}
                                onSpeak={playWord}
                                difficultyLabel={data.difficultyLabel}
                            />
                            <p className="mb-4 text-center text-xs text-gray-400">{articleContextLabel}</p>
                            <div className="mt-4 flex gap-2">
                                <Button
                                    type="button"
                                    className="flex-1 gap-1 rounded-xl bg-teal-600 hover:bg-teal-700"
                                    disabled={adding}
                                    onClick={() => {
                                        if (!data) return;
                                        setAdding(true);
                                        void Promise.resolve(onAddToWordBank(data)).finally(() => setAdding(false));
                                    }}
                                >
                                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
                                    加入生词本
                                </Button>
                                <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
                                    关闭
                                </Button>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
