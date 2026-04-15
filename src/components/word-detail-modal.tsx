import * as React from 'react';
import { Check, Download, Pencil, Share2, Volume2, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { VisualDictionaryCardBody } from "@/components/reading/visual-dictionary-card-body";
import { useWordBankStore, WordBankItem } from "@/store/wordBankStore";
import { fetchUnsplashImages } from "@/lib/unsplash";
import { speakEnglish } from '@/lib/speak-english';

interface WordDetailModalProps {
    word: WordBankItem;
    isOpen: boolean;
    onClose: () => void;
}

export function WordDetailModal({ word, isOpen, onClose }: WordDetailModalProps) {
    const modalRef = React.useRef<HTMLDivElement>(null);
    const { updateWord } = useWordBankStore();
    const [isEditing, setIsEditing] = React.useState(false);
    const [isSpeaking, setIsSpeaking] = React.useState(false);
    const [activeImageIndex, setActiveImageIndex] = React.useState(0);
    const [isImagesLoading, setIsImagesLoading] = React.useState(false);
    const [draft, setDraft] = React.useState(() => ({
        translation: word.translation || '',
        phonetic: word.phonetic || '',
        pos: word.pos || '',
        exampleSentence: word.exampleSentence || '',
        exampleTranslation: word.exampleTranslation || '',
    }));

    React.useEffect(() => {
        setDraft({
            translation: word.translation || '',
            phonetic: word.phonetic || '',
            pos: word.pos || '',
            exampleSentence: word.exampleSentence || '',
            exampleTranslation: word.exampleTranslation || '',
        });
    }, [word.id, word.translation, word.phonetic, word.pos, word.exampleSentence, word.exampleTranslation]);

    React.useEffect(() => {
        if (!isOpen) return;
        setActiveImageIndex(0);
    }, [isOpen, word.id]);

    React.useEffect(() => {
        if (!isOpen) return;
        const images = Array.isArray(word.images) ? word.images : [];
        if (images.length <= 1) return;

        const timer = window.setInterval(() => {
            setActiveImageIndex((prev) => (prev + 1) % images.length);
        }, 4500);

        return () => window.clearInterval(timer);
    }, [isOpen, word.id, word.images]);

    React.useEffect(() => {
        let cancelled = false;
        if (!isOpen) return;
        if (word.type !== 'word') return;
        if (Array.isArray(word.images) && word.images.length > 0) return;

        setIsImagesLoading(true);
        fetchUnsplashImages(word.word, { perPage: 4 })
            .then((urls) => {
                if (cancelled) return;
                if (urls.length > 0) updateWord(word.id, { images: urls });
            })
            .finally(() => {
                if (!cancelled) setIsImagesLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, word.id, word.word, word.type, word.images, updateWord]);

    // 关闭模态框
    const handleClose = () => {
        onClose();
    };

    // 点击遮罩层关闭
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === modalRef.current) {
            handleClose();
        }
    };

    const playAudio = (text: string) => {
        setIsSpeaking(true);
        void speakEnglish(text).finally(() => setIsSpeaking(false));
    };

    const handleDownloadCard = () => {
        // 保持现有行为（目前只是占位日志），但文案明确为下载海报
        console.log('Downloading card:', word);
    };

    // 分享功能
    const handleShare = () => {
        // 这里可以实现分享功能
        console.log('Sharing card:', word);
    };

    if (!isOpen) return null;

    const images = Array.isArray(word.images) ? word.images : [];
    const hero = images[activeImageIndex] || images[0];

    return (
        <div
            ref={modalRef}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={handleBackdropClick}
        >
            {/* 卡片容器 */}
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm relative overflow-hidden">

                {/* Hero image (immersive) */}
                {hero && (
                    <div className="relative h-[200px] w-full overflow-hidden bg-white">
                        <img
                            src={hero}
                            alt={`${word.word} visual`}
                            className="h-full w-full object-cover scale-[1.07] transition-transform duration-[9000ms] ease-out brightness-[0.94] saturate-[0.94]"
                        />
                        {/* 顶部轻 vignette，不压暗主体 */}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/5 via-transparent to-black/8" />
                        {/* 长行程白渐变：透明 → 约 85% 不透明白 → 实色与下方内容区对齐；无 blur，避免「分层白条」 */}
                        <div
                            className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(100%,12.5rem)] min-h-[120px] max-h-[200px]"
                            style={{
                                background:
                                    'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.02) 10%, rgba(255,255,255,0.08) 24%, rgba(255,255,255,0.22) 40%, rgba(255,255,255,0.48) 55%, rgba(255,255,255,0.72) 68%, rgba(255,255,255,0.85) 78%, rgba(255,255,255,0.94) 90%, #ffffff 100%)',
                            }}
                        />
                        <div className="absolute bottom-5 left-4 right-4 z-10 flex items-center justify-between gap-3">
                            <div className="text-[11px] text-white/95 font-semibold tracking-[0.2em] uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                                VISUAL DICTIONARY
                            </div>
                            {images.length > 1 && (
                                <div className="flex items-center gap-1.5">
                                    {images.slice(0, 4).map((u, idx) => (
                                        <button
                                            key={u}
                                            onClick={() => setActiveImageIndex(idx)}
                                            className={[
                                                "h-7 w-7 rounded-lg overflow-hidden border transition-all",
                                                idx === activeImageIndex ? "border-white shadow" : "border-white/40 opacity-80 hover:opacity-100"
                                            ].join(' ')}
                                        >
                                            <img src={u} alt="" className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {!hero && <div className="h-6" />}
                
                {/* 顶部关闭按钮 */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="relative z-20 -mt-px bg-white p-8 pt-8">
                {isEditing ? (
                    <>
                        <div className="mb-6 text-center">
                            <h1 className="mb-3 font-serif text-5xl font-bold tracking-tight text-gray-900">{word.word}</h1>
                            <div className="mt-3 flex items-center justify-center gap-2">
                                <input
                                    value={draft.phonetic}
                                    onChange={(e) => setDraft((d) => ({ ...d, phonetic: e.target.value }))}
                                    placeholder="Phonetic"
                                    className="w-36 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    value={draft.pos}
                                    onChange={(e) => setDraft((d) => ({ ...d, pos: e.target.value }))}
                                    placeholder="POS"
                                    className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => playAudio(word.word)}
                                    className={isSpeaking ? "text-blue-600" : "text-gray-400 hover:text-blue-600"}
                                >
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="mb-8 text-center">
                            <div className="mx-auto mb-4 mt-6 h-[2px] w-8 bg-gray-200" />
                            <textarea
                                value={draft.translation}
                                onChange={(e) => setDraft((d) => ({ ...d, translation: e.target.value }))}
                                placeholder="Translation"
                                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={2}
                            />
                        </div>
                        <div className="mb-8 mt-2 text-center">
                            <textarea
                                value={draft.exampleSentence}
                                onChange={(e) => setDraft((d) => ({ ...d, exampleSentence: e.target.value }))}
                                placeholder="Example sentence"
                                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center font-serif text-sm italic text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                            />
                            <p className="mb-3 mt-4 text-[10px] uppercase tracking-widest text-gray-400">— LINGOVIBE CONTEXT</p>
                            <textarea
                                value={draft.exampleTranslation}
                                onChange={(e) => setDraft((d) => ({ ...d, exampleTranslation: e.target.value }))}
                                placeholder="Example translation"
                                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={2}
                            />
                        </div>
                    </>
                ) : (
                    <VisualDictionaryCardBody
                        word={word.word}
                        phonetic={word.phonetic}
                        pos={word.pos}
                        translation={word.translation}
                        exampleSentence={word.exampleSentence}
                        exampleTranslation={word.exampleTranslation}
                        isSpeaking={isSpeaking}
                        onSpeak={() => playAudio(word.word)}
                    />
                )}

                {/* 底部操作区 */}
                <div className="mt-8 flex gap-3">
                    <Button
                        onClick={() => {
                            if (!isEditing) {
                                handleDownloadCard();
                                return;
                            }
                            updateWord(word.id, {
                                translation: draft.translation,
                                phonetic: draft.phonetic,
                                pos: draft.pos,
                                exampleSentence: draft.exampleSentence,
                                exampleTranslation: draft.exampleTranslation,
                            });
                            setIsEditing(false);
                        }}
                        className="flex-1 bg-[#1c1c1e] hover:bg-black text-white rounded-xl py-3 flex items-center justify-center gap-2"
                    >
                        {isEditing ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                        {isEditing ? '保存修改' : '下载卡片'}
                    </Button>
                    
                    <Button
                        onClick={() => {
                            if (isEditing) {
                                setIsEditing(false);
                                return;
                            }
                            setIsEditing(true);
                        }}
                        variant="outline"
                        className="w-12 h-12 border border-gray-200 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-50"
                    >
                        {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </Button>

                    {!isEditing && (
                        <Button
                            onClick={handleShare}
                            variant="outline"
                            className="w-12 h-12 border border-gray-200 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-50"
                        >
                            <Share2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                {isImagesLoading && (
                    <div className="mt-4 text-center text-[10px] text-gray-400">
                        图片加载中...
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}