import * as React from 'react';
import { Check, Download, Pencil, Share2, Volume2, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useWordBankStore, WordBankItem } from "@/store/wordBankStore";
import { fetchUnsplashImages } from "@/lib/unsplash";

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

    // 语音朗读功能
    const playAudio = (text: string) => {
        setIsSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Microsoft'))) || voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) utterance.voice = englishVoice;
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
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
                {/* 核心单词区 */}
                <div className="text-center mb-6">
                    <h1 className="font-serif text-5xl font-bold text-gray-900 tracking-tight mb-3">
                        {word.word}
                    </h1>
                    
                    {/* 音标与词性 */}
                    <div className="flex justify-center items-center gap-2 mt-3">
                        <span className="text-gray-500 text-sm">
                            {isEditing ? (
                                <input
                                    value={draft.phonetic}
                                    onChange={(e) => setDraft((d) => ({ ...d, phonetic: e.target.value }))}
                                    placeholder="Phonetic"
                                    className="w-36 text-center text-sm bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            ) : (
                                word.phonetic || 'No phonetic'
                            )}
                        </span>
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded">
                            {isEditing ? (
                                <input
                                    value={draft.pos}
                                    onChange={(e) => setDraft((d) => ({ ...d, pos: e.target.value }))}
                                    placeholder="POS"
                                    className="w-20 text-center text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            ) : (
                                word.pos || 'Unknown'
                            )}
                        </span>
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

                {/* 简短释义区 */}
                <div className="text-center mb-8">
                    <div className="w-8 h-[2px] bg-gray-200 mx-auto mt-6 mb-4" />
                    <p className="text-gray-800 font-medium text-base">
                        {isEditing ? (
                            <textarea
                                value={draft.translation}
                                onChange={(e) => setDraft((d) => ({ ...d, translation: e.target.value }))}
                                placeholder="Translation"
                                className="w-full text-center text-base bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={2}
                            />
                        ) : (
                            word.translation || 'No translation available'
                        )}
                    </p>
                </div>

                {/* 沉浸式例句区 */}
                {(word.exampleSentence || word.exampleTranslation) && (
                    <div className="text-center mb-8 mt-2">
                        {word.exampleSentence && (
                            isEditing ? (
                                <textarea
                                    value={draft.exampleSentence}
                                    onChange={(e) => setDraft((d) => ({ ...d, exampleSentence: e.target.value }))}
                                    placeholder="Example sentence"
                                    className="w-full text-center text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-serif italic text-gray-800"
                                    rows={3}
                                />
                            ) : (
                                <p className="font-serif italic text-gray-800 text-lg text-center leading-relaxed">
                                    {word.exampleSentence}
                                </p>
                            )
                        )}
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-4 mb-3">
                            — LINGOVIBE CONTEXT
                        </p>
                        {word.exampleTranslation && (
                            isEditing ? (
                                <textarea
                                    value={draft.exampleTranslation}
                                    onChange={(e) => setDraft((d) => ({ ...d, exampleTranslation: e.target.value }))}
                                    placeholder="Example translation"
                                    className="w-full text-center text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-500"
                                    rows={2}
                                />
                            ) : (
                                <p className="text-sm text-gray-500 text-center">
                                    {word.exampleTranslation}
                                </p>
                            )
                        )}
                    </div>
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