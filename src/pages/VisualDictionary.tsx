import * as React from 'react';
import {
    Loader2,
    Image as ImageIcon,
    PanelLeft,
    BookPlus,
    Check,
    Sparkles,
    TrendingUp,
    ChevronRight,
    Volume2,
    Square,
    BookOpen,
} from 'lucide-react';
import { useWordBankStore, WordBankItem } from '@/store/wordBankStore';
import { useToast } from '@/components/ui/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchHistorySidebar, SearchHistoryItem } from '@/components/visual-dictionary/SearchHistorySidebar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchUnsplashImages } from '@/lib/unsplash';
import { callAiProxy } from '@/lib/api-client';
import { recordVisualLookup } from '@/store/learningAnalyticsStore';
import { useEnglishTts } from '@/hooks/use-english-tts';

export function VisualDictionaryPage() {
    const { words, addWord } = useWordBankStore();

    const [query, setQuery] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [currentEntry, setCurrentEntry] = React.useState<WordBankItem | null>(null);
    const [activeImageIdx, setActiveImageIdx] = React.useState(0);
    const [showHistory, setShowHistory] = React.useState(
        () => typeof window !== 'undefined' && window.innerWidth >= 1024,
    );
    const [showSavedDrawer, setShowSavedDrawer] = React.useState(false);

    const [searchHistory, setSearchHistory] = React.useState<SearchHistoryItem[]>(() => {
        try {
            const saved = localStorage.getItem('visualSearchHistory');
            if (saved) return JSON.parse(saved);
        } catch (error) {
            console.error('Failed to parse search history from localStorage:', error);
        }
        return [];
    });
    const { toast } = useToast();

    const wordTts = useEnglishTts(currentEntry?.word ?? '');

    const isCurrentInWordBank = Boolean(
        currentEntry &&
            words.some(
                (w) => w.type === 'word' && w.word.toLowerCase() === currentEntry.word.toLowerCase(),
            ),
    );

    const bankWords = React.useMemo(
        () => [...words].filter((w) => w.type === 'word').sort((a, b) => b.addedAt - a.addedAt),
        [words],
    );

    const handleAddCurrentToWordBank = React.useCallback(() => {
        if (!currentEntry) return;
        if (words.some((w) => w.type === 'word' && w.word.toLowerCase() === currentEntry.word.toLowerCase())) {
            toast(`"${currentEntry.word}" 已在生词本中`, 'default');
            return;
        }
        void addWord({
            word: currentEntry.word,
            type: 'word',
            translation: currentEntry.translation || '',
            synonyms: currentEntry.synonyms,
            color: currentEntry.color,
            images: currentEntry.images,
            context: 'Visual Dictionary',
        });
        toast(`"${currentEntry.word}" 已添加到生词本`, 'success');
    }, [currentEntry, words, addWord, toast]);

    const addToSearchHistory = React.useCallback((q: string) => {
        const newItem: SearchHistoryItem = {
            id: `${q}-${Date.now()}`,
            query: q.trim(),
            timestamp: Date.now(),
        };
        setSearchHistory((prev) => {
            const filtered = prev.filter((item) => item.query.toLowerCase() !== q.toLowerCase());
            return [newItem, ...filtered].slice(0, 50);
        });
    }, []);

    const deleteSearchHistory = React.useCallback((id: string) => {
        setSearchHistory((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const clearSearchHistory = React.useCallback(() => {
        setSearchHistory([]);
        toast('搜索历史已清空', 'default');
    }, [toast]);

    const handleSelectHistory = React.useCallback((q: string) => {
        setQuery(q);
    }, []);

    React.useEffect(() => {
        try {
            localStorage.setItem('visualSearchHistory', JSON.stringify(searchHistory));
        } catch (error) {
            console.error('Failed to save search history to localStorage:', error);
        }
    }, [searchHistory]);

    React.useEffect(() => {
        setActiveImageIdx(0);
    }, [currentEntry?.word]);

    const handleSearch = async () => {
        if (!query.trim()) return;

        setIsLoading(true);
        try {
            const [data, imageUrls] = await Promise.all([
                callAiProxy({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a visual dictionary assistant. Return ONLY JSON format.',
                        },
                        {
                            role: 'user',
                            content: `For the word "${query}", provide:
1. definition: a short English definition (under 15 words).
2. synonyms: 3 English synonyms.
3. color: a HEX color code representing the word's mood/vibe.
Format: {"definition": "...", "synonyms": ["...", "...", "..."], "color": "..."}`,
                        },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.3,
                }),
                fetchUnsplashImages(query, { perPage: 4 }),
            ]);

            const llmContent = JSON.parse((data as any).choices[0].message.content);
            const safeImages = Array.isArray(imageUrls) ? imageUrls : [];

            const newEntry: Partial<Omit<WordBankItem, 'id' | 'addedAt' | 'nextReviewDate' | 'interval' | 'level'>> = {
                word: query.toLowerCase(),
                type: 'word',
                translation: llmContent.definition,
                synonyms: llmContent.synonyms || [],
                color: llmContent.color || '#64748b',
                images: safeImages,
            };

            setCurrentEntry({
                ...newEntry,
                id: '',
                addedAt: Date.now(),
                nextReviewDate: Date.now(),
                interval: 1,
                level: 0,
            } as WordBankItem);
            addToSearchHistory(query);
            setQuery('');
            recordVisualLookup();
        } catch (error) {
            console.error(error);
            toast('查词失败，请检查网络连接后重试。', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const retention = Math.min(95, 50 + Math.min(bankWords.length, 12) * 3);
    const accent = normalizeHex(currentEntry?.color) ?? '#64748b';
    const images = currentEntry?.images ?? [];
    const hero = images[activeImageIdx] ?? images[0];
    const onImgErr =
        (idx: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
            const target = e.currentTarget;
            target.onerror = null;
            target.src = `https://images.unsplash.com/photo-1518623489648-a173ef7824f3?auto=format&fit=crop&w=800&q=80&sig=fallback_${idx}`;
            target.className = `${target.className} opacity-50 grayscale`;
        };

    return (
        <div className="relative flex h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-stitch-outline/15 bg-stitch-surface md:h-[calc(100vh-8rem)] md:max-h-[calc(100vh-8rem)] md:flex-row md:rounded-3xl">
            {/* 左：搜索历史（抽屉/固定） */}
            {showHistory && (
                <>
                    <button
                        type="button"
                        aria-label="关闭搜索历史"
                        className="fixed inset-0 z-[45] bg-black/45 backdrop-blur-[1px] lg:hidden"
                        onClick={() => setShowHistory(false)}
                    />
                    <div className="fixed inset-y-0 left-0 z-50 h-full w-[min(20rem,90vw)] shadow-2xl lg:static lg:z-auto lg:w-72 lg:shrink-0 lg:shadow-none">
                        <SearchHistorySidebar
                            history={searchHistory}
                            onSelectHistory={(q) => {
                                handleSelectHistory(q);
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setShowHistory(false);
                                }
                            }}
                            onDeleteHistory={deleteSearchHistory}
                            onClearAll={clearSearchHistory}
                            onClose={() => setShowHistory(false)}
                        />
                    </div>
                </>
            )}

            {/* 右：Saved Words 抽屉（中屏幕） */}
            {showSavedDrawer && (
                <>
                    <button
                        type="button"
                        aria-label="关闭生词本面板"
                        className="fixed inset-0 z-[45] bg-black/45 backdrop-blur-[1px] xl:hidden"
                        onClick={() => setShowSavedDrawer(false)}
                    />
                    <div className="fixed inset-y-0 right-0 z-50 h-full w-[min(22rem,92vw)] shadow-2xl xl:hidden">
                        <SavedWordsPanel
                            bankWords={bankWords}
                            retention={retention}
                            onPick={(w) => {
                                setCurrentEntry(w);
                                setShowSavedDrawer(false);
                            }}
                            onLibraryClick={() => toast('请从主导航打开「我的生词本」查看全部', 'default')}
                            onClose={() => setShowSavedDrawer(false)}
                        />
                    </div>
                </>
            )}

            {/* 主滚动区 */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stitch-surface">
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                    <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 px-4 py-5 sm:px-6 md:py-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8 xl:px-8">
                        {/* 主列 */}
                        <div className="min-w-0 space-y-6">
                            {/* 顶栏：历史 + 标题 + 查看生词本 */}
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => setShowHistory((v) => !v)}
                                    className="h-9 gap-1.5 border-stitch-outline/20 bg-white/90 text-stitch-on-surface shadow-sm"
                                >
                                    <PanelLeft className="h-4 w-4" />
                                    <span className="text-xs font-semibold">
                                        {showHistory ? '隐藏历史' : `搜索历史 · ${searchHistory.length}`}
                                    </span>
                                </Button>
                                <div className="min-w-0 flex-1 pl-1">
                                    <h1 className="truncate text-[13px] font-semibold uppercase tracking-[0.18em] text-stitch-on-surface-variant">
                                        Visual Dictionary
                                    </h1>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => setShowSavedDrawer(true)}
                                    className="h-9 gap-1.5 border-stitch-outline/20 bg-white/90 text-stitch-on-surface shadow-sm xl:hidden"
                                >
                                    <BookOpen className="h-4 w-4" />
                                    <span className="text-xs font-semibold">{bankWords.length} 生词</span>
                                </Button>
                            </div>

                            {/* 搜索框 */}
                            <div className="relative">
                                <div className="flex items-center rounded-2xl border border-stitch-outline/15 bg-white p-1.5 shadow-sm focus-within:border-stitch-primary/40 focus-within:shadow-md">
                                    <Sparkles
                                        className="ml-3 h-5 w-5 shrink-0 text-stitch-outline"
                                        strokeWidth={1.75}
                                    />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                                        placeholder="输入一个英文单词，如 serenity / apple / photosynthesis…"
                                        className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3 pr-2 text-base text-stitch-on-surface placeholder:text-stitch-outline/60 focus:outline-none focus:ring-0"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleSearch()}
                                        disabled={isLoading || !query.trim()}
                                        className="shrink-0 rounded-xl bg-stitch-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            'Generate'
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* 主内容区：加载 / 空 / 结果 */}
                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <motion.div
                                        key="loading"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <HeroSkeleton />
                                    </motion.div>
                                ) : currentEntry ? (
                                    <motion.div
                                        key={currentEntry.word}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="space-y-4"
                                    >
                                        {/* Hero 卡片 */}
                                        <div
                                            className="relative overflow-hidden rounded-3xl border border-stitch-outline/10 bg-white shadow-sm"
                                            style={{
                                                background: `linear-gradient(90deg, ${accent} 0%, ${accent} 4px, #ffffff 4px, #ffffff 100%)`,
                                            }}
                                        >
                                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                                                <div className="relative aspect-[4/3] overflow-hidden bg-stitch-surface-container-high lg:aspect-auto lg:min-h-[360px]">
                                                    {hero ? (
                                                        <img
                                                            src={hero}
                                                            alt={currentEntry.word}
                                                            className="h-full w-full object-cover"
                                                            onError={onImgErr(activeImageIdx)}
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center">
                                                            <ImageIcon className="h-16 w-16 text-stitch-outline/40" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-4 p-6 sm:p-7 lg:p-8">
                                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stitch-on-surface-variant/80">
                                                        <span
                                                            aria-hidden
                                                            className="inline-block h-3 w-3 rounded-full ring-1 ring-inset ring-black/10"
                                                            style={{ backgroundColor: accent }}
                                                        />
                                                        <span className="uppercase">{accent}</span>
                                                    </div>

                                                    <h2 className="font-headline text-4xl font-extrabold capitalize leading-tight tracking-tight text-stitch-on-surface sm:text-5xl">
                                                        {currentEntry.word}
                                                    </h2>

                                                    {currentEntry.phonetic ? (
                                                        <p className="-mt-1 font-mono text-sm italic text-stitch-outline">
                                                            {currentEntry.phonetic}
                                                        </p>
                                                    ) : null}

                                                    <p className="text-[15px] leading-relaxed text-stitch-on-surface-variant sm:text-base">
                                                        {currentEntry.translation || '—'}
                                                    </p>

                                                    {currentEntry.synonyms && currentEntry.synonyms.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {currentEntry.synonyms.map((syn: string) => (
                                                                <span
                                                                    key={syn}
                                                                    className="rounded-full bg-stitch-surface-container-high px-3 py-1 text-xs font-semibold text-stitch-on-surface-variant"
                                                                >
                                                                    {syn}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={wordTts.isPlaying ? 'default' : 'outline'}
                                                            onClick={wordTts.toggle}
                                                            className="h-10 gap-1.5 rounded-xl px-4"
                                                            aria-label={wordTts.isPlaying ? '停止朗读' : '朗读'}
                                                        >
                                                            {wordTts.isPlaying ? (
                                                                <Square className="h-4 w-4" />
                                                            ) : (
                                                                <Volume2 className="h-4 w-4" />
                                                            )}
                                                            {wordTts.isPlaying ? '停止' : '朗读'}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={isCurrentInWordBank ? 'outline' : 'default'}
                                                            onClick={handleAddCurrentToWordBank}
                                                            disabled={isCurrentInWordBank}
                                                            className={cn(
                                                                'h-10 gap-1.5 rounded-xl px-4 font-semibold',
                                                                isCurrentInWordBank
                                                                    ? 'border-stitch-outline/30 bg-white text-stitch-on-surface-variant'
                                                                    : 'bg-stitch-primary text-white hover:bg-[#2563eb]',
                                                            )}
                                                        >
                                                            {isCurrentInWordBank ? (
                                                                <>
                                                                    <Check className="h-4 w-4" />
                                                                    已在生词本
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <BookPlus className="h-4 w-4" />
                                                                    加入生词本
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 缩图条 */}
                                        {images.length > 1 && (
                                            <div className="grid grid-cols-4 gap-3">
                                                {images.slice(0, 4).map((img, idx) => (
                                                    <button
                                                        type="button"
                                                        key={`${currentEntry.word}-thumb-${idx}`}
                                                        onClick={() => setActiveImageIdx(idx)}
                                                        className={cn(
                                                            'group relative aspect-[4/3] overflow-hidden rounded-2xl border transition-all',
                                                            idx === activeImageIdx
                                                                ? 'border-stitch-primary ring-2 ring-stitch-primary/30'
                                                                : 'border-stitch-outline/10 hover:border-stitch-outline/30',
                                                        )}
                                                        aria-label={`查看第 ${idx + 1} 张图`}
                                                    >
                                                        <img
                                                            src={img}
                                                            alt=""
                                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                            onError={onImgErr(idx)}
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-stitch-outline/20 bg-white/60 py-20 text-center"
                                    >
                                        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-stitch-surface-container-high">
                                            <ImageIcon className="h-10 w-10 text-stitch-outline/40" />
                                        </div>
                                        <h2 className="font-headline text-xl font-bold text-stitch-on-surface-variant">
                                            Visual Vocabulary
                                        </h2>
                                        <p className="mt-2 max-w-md px-6 text-sm text-stitch-on-surface-variant/90">
                                            输入任意英文单词，AI 会配图 + 给出释义和情绪色板；结果可一键加入生词本。
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 右：xl 以上固定显示 */}
                        <aside className="hidden xl:block">
                            <div className="sticky top-4 space-y-4">
                                <SavedWordsPanel
                                    bankWords={bankWords}
                                    retention={retention}
                                    onPick={(w) => setCurrentEntry(w)}
                                    onLibraryClick={() =>
                                        toast('请从主导航打开「我的生词本」查看全部', 'default')
                                    }
                                />
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------- sub components ------------------------- */

function SavedWordsPanel({
    bankWords,
    retention,
    onPick,
    onLibraryClick,
    onClose,
}: {
    bankWords: WordBankItem[];
    retention: number;
    onPick: (w: WordBankItem) => void;
    onLibraryClick: () => void;
    onClose?: () => void;
}) {
    return (
        <div className="flex h-full flex-col gap-4 bg-stitch-surface-container-low xl:rounded-3xl xl:border xl:border-stitch-outline/10 xl:bg-stitch-surface-container-low">
            <div className="flex flex-col gap-4 p-5 xl:p-6">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="font-headline text-lg font-bold text-stitch-on-surface">生词本</h2>
                    <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-stitch-primary px-2 py-0.5 text-xs font-bold text-white">
                            {bankWords.length} 词
                        </span>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="关闭"
                                className="rounded-full p-1 text-stitch-outline hover:bg-stitch-surface-container-high"
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                                    <path
                                        d="M6 6l12 12M6 18L18 6"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="-mx-1 flex-1 space-y-2 overflow-y-auto pr-1 xl:max-h-[min(50vh,460px)]">
                    {bankWords.length === 0 ? (
                        <p className="px-1 text-sm text-stitch-on-surface-variant">
                            还没有单词。查一个词后点"加入生词本"即可保存。
                        </p>
                    ) : (
                        bankWords.slice(0, 30).map((w) => (
                            <button
                                key={w.id}
                                type="button"
                                onClick={() => onPick(w)}
                                className="flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 text-left transition-transform hover:translate-x-0.5 hover:shadow-sm"
                            >
                                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-stitch-surface-container-high">
                                    {w.images?.[0] ? (
                                        <img src={w.images[0]} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <ImageIcon className="h-5 w-5 text-stitch-outline/40" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-stitch-on-surface">{w.word}</p>
                                    <p className="truncate text-xs text-stitch-on-surface-variant">
                                        {(w.synonyms && w.synonyms[0]) || w.translation || '—'}
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-stitch-outline" />
                            </button>
                        ))
                    )}
                </div>

                <button
                    type="button"
                    onClick={onLibraryClick}
                    className="rounded-xl border border-stitch-outline/20 bg-white py-2.5 text-sm font-semibold text-stitch-on-surface-variant transition-colors hover:bg-stitch-surface-container-high"
                >
                    View Library
                </button>

                <div className="rounded-2xl bg-gradient-to-br from-stitch-secondary to-stitch-on-secondary-container p-4 text-white shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <TrendingUp className="h-4 w-4" />
                        Learning Stats
                    </div>
                    <div className="font-headline text-2xl font-black">{retention}%</div>
                    <p className="mb-3 text-xs text-white/80">基于当前生词本词量的示意留存指数</p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                        <div className="h-full rounded-full bg-white" style={{ width: `${retention}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function HeroSkeleton() {
    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-stitch-outline/10 bg-white">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                    <div className="aspect-[4/3] animate-pulse bg-stitch-surface-container-high lg:aspect-auto lg:min-h-[360px]" />
                    <div className="space-y-4 p-6 sm:p-8">
                        <div className="h-3 w-24 animate-pulse rounded-full bg-stitch-surface-container-high" />
                        <div className="h-10 w-3/4 animate-pulse rounded-lg bg-stitch-surface-container-high" />
                        <div className="space-y-2">
                            <div className="h-3 w-full animate-pulse rounded-full bg-stitch-surface-container-high" />
                            <div className="h-3 w-5/6 animate-pulse rounded-full bg-stitch-surface-container-high" />
                        </div>
                        <div className="flex gap-2">
                            <div className="h-6 w-16 animate-pulse rounded-full bg-stitch-surface-container-high" />
                            <div className="h-6 w-20 animate-pulse rounded-full bg-stitch-surface-container-high" />
                            <div className="h-6 w-14 animate-pulse rounded-full bg-stitch-surface-container-high" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <div className="h-10 w-24 animate-pulse rounded-xl bg-stitch-surface-container-high" />
                            <div className="h-10 w-28 animate-pulse rounded-xl bg-stitch-surface-container-high" />
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="aspect-[4/3] animate-pulse rounded-2xl bg-stitch-surface-container-high"
                    />
                ))}
            </div>
        </div>
    );
}

/** 规整 HEX 色：允许 `#RGB` / `#RRGGBB`；无效返回 null */
function normalizeHex(input?: string | null): string | null {
    if (!input) return null;
    const s = input.trim();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    return null;
}
