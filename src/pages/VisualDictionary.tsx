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
    Bookmark,
    Volume2,
} from 'lucide-react';
import { useWordBankStore, WordBankItem } from "@/store/wordBankStore";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { SearchHistorySidebar, SearchHistoryItem } from "@/components/visual-dictionary/SearchHistorySidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchUnsplashImages } from "@/lib/unsplash";
import { callAiProxy } from "@/lib/api-client";
import { recordVisualLookup } from "@/store/learningAnalyticsStore";

export function VisualDictionaryPage() {
    const { words, addWord } = useWordBankStore();
    
    const [query, setQuery] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [currentEntry, setCurrentEntry] = React.useState<WordBankItem | null>(null);
    const [showHistory, setShowHistory] = React.useState(
        () => typeof window !== 'undefined' && window.innerWidth >= 768
    );
    
    // 从 localStorage 初始化搜索历史
    const [searchHistory, setSearchHistory] = React.useState<SearchHistoryItem[]>(() => {
        try {
            const saved = localStorage.getItem('visualSearchHistory');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to parse search history from localStorage:', error);
        }
        return [];
    });
    const { toast } = useToast();

    const isCurrentInWordBank = Boolean(
        currentEntry &&
            words.some(
                (w) => w.type === 'word' && w.word.toLowerCase() === currentEntry.word.toLowerCase()
            )
    );

    const bankWords = React.useMemo(
        () => [...words].filter((w) => w.type === 'word').sort((a, b) => b.addedAt - a.addedAt),
        [words]
    );

    const handleAddCurrentToWordBank = React.useCallback(() => {
        if (!currentEntry) return;
        if (
            words.some((w) => w.type === 'word' && w.word.toLowerCase() === currentEntry.word.toLowerCase())
        ) {
            toast(`"${currentEntry.word}" 已在生词本中`, "default");
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
        toast(`"${currentEntry.word}" 已添加到生词本`, "success");
    }, [currentEntry, words, addWord, toast]);

    // 搜索历史管理函数
    const addToSearchHistory = React.useCallback((query: string) => {
        const newHistoryItem: SearchHistoryItem = {
            id: `${query}-${Date.now()}`,
            query: query.trim(),
            timestamp: Date.now(),
        };

        setSearchHistory(prev => {
            // 移除重复的查询
            const filtered = prev.filter(item => item.query.toLowerCase() !== query.toLowerCase());
            // 添加到开头并限制数量
            return [newHistoryItem, ...filtered].slice(0, 50);
        });
    }, []);

    const deleteSearchHistory = React.useCallback((id: string) => {
        setSearchHistory(prev => prev.filter(item => item.id !== id));
    }, []);

    const clearSearchHistory = React.useCallback(() => {
        setSearchHistory([]);
        toast("搜索历史已清空", "default");
    }, [toast]);

    const handleSelectHistory = React.useCallback((query: string) => {
        setQuery(query);
        // 可以在这里触发自动搜索
        // handleSearch(); // 如果需要自动搜索，取消注释这行
    }, []);

    // 实时同步保存搜索历史到 localStorage
    React.useEffect(() => {
        try {
            localStorage.setItem('visualSearchHistory', JSON.stringify(searchHistory));
        } catch (error) {
            console.error('Failed to save search history to localStorage:', error);
        }
    }, [searchHistory]);

    const handleSearch = async () => {
        if (!query.trim()) return;

        setIsLoading(true);
        try {
            // Concurrent requests: AI proxy + Unsplash
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
                fetchUnsplashImages(query, { perPage: 3 }),
            ]);

            const llmContent = JSON.parse((data as any).choices[0].message.content);
            const safeImages = Array.isArray(imageUrls) ? imageUrls : [];

            const newEntry: Partial<Omit<WordBankItem, 'id' | 'addedAt' | 'nextReviewDate' | 'interval' | 'level'>> = {
                word: query.toLowerCase(),
                type: 'word',
                translation: llmContent.definition,
                synonyms: llmContent.synonyms || [],
                color: llmContent.color || '#F3F4F6',
                images: safeImages,
            };

            setCurrentEntry({ ...newEntry, id: '', addedAt: Date.now(), nextReviewDate: Date.now(), interval: 1, level: 0 } as WordBankItem);
            addToSearchHistory(query);
            setQuery('');
            recordVisualLookup();
            
        } catch (error) {
            console.error(error);
            toast("查词失败，请检查网络连接后重试。", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const VISUAL_RETENTION_DISPLAY = Math.min(95, 50 + Math.min(bankWords.length, 12) * 3);

    return (
        <div className="relative flex h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-stitch-outline/15 bg-stitch-surface md:h-[calc(100vh-8rem)] md:max-h-[calc(100vh-8rem)] md:flex-row md:rounded-3xl">
            {showHistory && (
                <>
                    <button
                        type="button"
                        aria-label="关闭搜索历史"
                        className="fixed inset-0 z-[45] bg-black/45 backdrop-blur-[1px] md:hidden"
                        onClick={() => setShowHistory(false)}
                    />
                    <div className="fixed inset-y-0 left-0 z-50 h-full w-[min(22rem,92vw)] shadow-2xl md:static md:z-auto md:w-80 md:max-w-none md:shadow-none">
                        <SearchHistorySidebar
                            history={searchHistory}
                            onSelectHistory={(q) => {
                                handleSelectHistory(q);
                                if (typeof window !== 'undefined' && window.innerWidth < 768) {
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

            <motion.div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-colors duration-500"
                animate={{ backgroundColor: currentEntry?.color || '#f9f9ff' }}
            >
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-8">
                        <header className="mb-8 max-w-4xl text-center sm:mb-10 md:mx-auto">
                            <div className="mb-6 flex flex-wrap items-center justify-center gap-3 sm:justify-between sm:text-left">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => setShowHistory(!showHistory)}
                                    className="h-10 shrink-0 border-stitch-outline/20 bg-white/90 text-stitch-on-surface shadow-sm"
                                >
                                    <PanelLeft className="mr-1.5 h-4 w-4" />
                                    <span className="text-xs font-semibold sm:text-sm">{showHistory ? '隐藏历史' : '搜索历史'}</span>
                                </Button>
                                <span className="text-xs font-medium text-stitch-on-surface-variant sm:ml-auto">
                                    {searchHistory.length} 条搜索记录
                                </span>
                            </div>
                            <h1 className="font-headline mb-3 text-4xl font-extrabold tracking-tight text-stitch-on-surface sm:text-5xl">
                                Visual Vocabulary
                            </h1>
                            <p className="mx-auto mb-8 max-w-2xl text-base text-stitch-on-surface-variant sm:text-lg">
                                用 AI 配图把抽象词变成可记忆的画面；搜索后可将词条收入生词本。
                            </p>
                            <div className="group relative mx-auto max-w-2xl">
                                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-stitch-primary to-stitch-tertiary opacity-10 blur transition duration-1000 group-hover:opacity-20" />
                                <div className="relative flex items-center rounded-2xl border border-[#c3c6d7]/10 bg-stitch-surface-container-lowest p-2 shadow-xl shadow-stitch-on-surface/5">
                                    <Sparkles className="ml-3 h-6 w-6 shrink-0 text-stitch-outline sm:ml-4" strokeWidth={1.75} />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                                        placeholder="Type a word like 'Serenity' or 'Technocracy'..."
                                        className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3 pr-2 text-base text-stitch-on-surface placeholder:text-stitch-outline/50 focus:outline-none focus:ring-0 sm:py-4 sm:text-lg"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleSearch()}
                                        disabled={isLoading}
                                        className="shrink-0 rounded-xl bg-stitch-primary px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#2563eb] disabled:opacity-50 sm:px-8 sm:py-4"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            'Generate'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </header>

                        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
                            <div className="xl:col-span-9">
                                <AnimatePresence mode="wait">
                                    {isLoading ? (
                                        <motion.div
                                            key="loading"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex flex-col items-center justify-center space-y-4 py-24"
                                        >
                                            <div className="relative h-16 w-16">
                                                <motion.div
                                                    className="absolute inset-0 rounded-full border-4 border-stitch-primary/20"
                                                    animate={{ scale: [1, 1.15, 1], opacity: [0.4, 1, 0.4] }}
                                                    transition={{ duration: 2, repeat: Infinity }}
                                                />
                                                <Loader2 className="h-16 w-16 animate-spin text-stitch-primary/50" />
                                            </div>
                                            <p className="animate-pulse text-xs font-bold uppercase tracking-widest text-stitch-on-surface-variant">
                                                Fetching visual essence…
                                            </p>
                                        </motion.div>
                                    ) : currentEntry ? (
                                        <motion.div
                                            key={currentEntry.word}
                                            initial={{ opacity: 0, y: 16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -16 }}
                                            className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
                                        >
                                            {(() => {
                                                const imgs = currentEntry.images ?? [];
                                                const hero = imgs[0];
                                                const onImgErr =
                                                    (idx: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
                                                        const target = e.currentTarget;
                                                        target.onerror = null;
                                                        target.src = `https://images.unsplash.com/photo-1518623489648-a173ef7824f3?auto=format&fit=crop&w=800&q=80&sig=fallback_${idx}`;
                                                        target.className = `${target.className} opacity-50 grayscale`;
                                                    };
                                                return (
                                                    <>
                                                        <div className="group relative flex flex-col overflow-hidden rounded-3xl bg-stitch-surface-container-lowest shadow-sm transition-all duration-300 hover:shadow-2xl hover:shadow-stitch-on-surface/10 md:col-span-2">
                                                            <div className="relative aspect-video overflow-hidden">
                                                                {hero ? (
                                                                    <img
                                                                        src={hero}
                                                                        alt={currentEntry.word}
                                                                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                                        onError={onImgErr(0)}
                                                                    />
                                                                ) : (
                                                                    <div className="flex h-full w-full items-center justify-center bg-stitch-surface-container-high">
                                                                        <ImageIcon className="h-16 w-16 text-stitch-outline/40" />
                                                                    </div>
                                                                )}
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                                                <button
                                                                    type="button"
                                                                    onClick={handleAddCurrentToWordBank}
                                                                    disabled={isCurrentInWordBank}
                                                                    className={cn(
                                                                        'absolute right-4 top-4 rounded-xl p-2 shadow-sm backdrop-blur-md',
                                                                        'bg-white/80 transition-colors hover:bg-white',
                                                                        isCurrentInWordBank && 'opacity-80'
                                                                    )}
                                                                    title={isCurrentInWordBank ? '已在生词本' : '添加到生词本'}
                                                                >
                                                                    <Bookmark
                                                                        className={cn(
                                                                            'h-5 w-5',
                                                                            isCurrentInWordBank
                                                                                ? 'fill-stitch-primary text-stitch-primary'
                                                                                : 'text-stitch-primary'
                                                                        )}
                                                                    />
                                                                </button>
                                                                <div className="absolute bottom-5 left-5 text-white">
                                                                    <div className="mb-2 flex flex-wrap items-center gap-3">
                                                                        <h3 className="font-headline text-2xl font-bold capitalize sm:text-3xl">
                                                                            {currentEntry.word}
                                                                        </h3>
                                                                        <button
                                                                            type="button"
                                                                            disabled
                                                                            title="朗读即将支持"
                                                                            className="cursor-not-allowed text-white/50"
                                                                        >
                                                                            <Volume2 className="h-6 w-6" />
                                                                        </button>
                                                                    </div>
                                                                    <p className="max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
                                                                        {currentEntry.translation}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {imgs.slice(1, 3).map((img, idx) => (
                                                            <motion.div
                                                                key={`${currentEntry.word}-img-${idx + 1}`}
                                                                initial={{ opacity: 0, scale: 0.96 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: (idx + 1) * 0.08 }}
                                                                className="group flex flex-col overflow-hidden rounded-3xl bg-stitch-surface-container-lowest shadow-sm transition-all duration-300 hover:shadow-2xl hover:shadow-stitch-on-surface/10"
                                                            >
                                                                <div className="relative aspect-square overflow-hidden">
                                                                    <img
                                                                        src={img}
                                                                        alt=""
                                                                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                                        onError={onImgErr(idx + 1)}
                                                                    />
                                                                    <div className="absolute bottom-4 left-4 rounded-lg bg-black/40 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                                                                        Visual
                                                                    </div>
                                                                </div>
                                                                <div className="p-5">
                                                                    <div className="mb-2 flex items-start justify-between gap-2">
                                                                        <h3 className="font-headline text-xl font-bold capitalize">
                                                                            {currentEntry.word}
                                                                        </h3>
                                                                        <button
                                                                            type="button"
                                                                            disabled
                                                                            title="朗读即将支持"
                                                                            className="cursor-not-allowed text-stitch-outline"
                                                                        >
                                                                            <Volume2 className="h-5 w-5" />
                                                                        </button>
                                                                    </div>
                                                                    {currentEntry.phonetic ? (
                                                                        <p className="mb-3 font-mono text-xs italic tracking-wider text-[#c3c6d7]">
                                                                            {currentEntry.phonetic}
                                                                        </p>
                                                                    ) : null}
                                                                    <p className="text-sm leading-relaxed text-stitch-on-surface-variant">
                                                                        {currentEntry.translation}
                                                                    </p>
                                                                </div>
                                                            </motion.div>
                                                        ))}

                                                        <div className="rounded-3xl border border-[#c3c6d7]/10 bg-stitch-surface-container-lowest p-6 md:col-span-2 lg:col-span-3">
                                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                                <div className="min-w-0 text-center sm:text-left">
                                                                    <h2 className="font-headline text-2xl font-bold capitalize text-stitch-on-surface sm:text-3xl">
                                                                        {currentEntry.word}
                                                                    </h2>
                                                                    {currentEntry.phonetic ? (
                                                                        <p className="mt-1 font-mono text-sm italic text-[#c3c6d7]">
                                                                            {currentEntry.phonetic}
                                                                        </p>
                                                                    ) : null}
                                                                    <p className="mt-3 text-sm leading-relaxed text-stitch-on-surface-variant sm:text-base">
                                                                        {currentEntry.translation}
                                                                    </p>
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    variant={isCurrentInWordBank ? 'outline' : 'default'}
                                                                    className={cn(
                                                                        'h-11 shrink-0 gap-2 rounded-xl px-6 font-semibold shadow-sm',
                                                                        isCurrentInWordBank
                                                                            ? 'border-stitch-outline/30 bg-white text-stitch-on-surface-variant'
                                                                            : 'bg-stitch-primary text-white hover:bg-[#2563eb]'
                                                                    )}
                                                                    onClick={handleAddCurrentToWordBank}
                                                                    disabled={isCurrentInWordBank}
                                                                >
                                                                    {isCurrentInWordBank ? (
                                                                        <>
                                                                            <Check className="h-4 w-4" />
                                                                            已在生词本
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <BookPlus className="h-4 w-4" />
                                                                            添加到生词本
                                                                        </>
                                                                    )}
                                                                </Button>
                                                            </div>
                                                            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                                                                {(currentEntry.synonyms ?? []).map((syn: string) => (
                                                                    <span
                                                                        key={syn}
                                                                        className="rounded-full bg-stitch-surface-container-high px-4 py-2 text-xs font-semibold text-stitch-on-surface-variant"
                                                                    >
                                                                        {syn}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="empty"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="flex flex-col items-center justify-center py-20 text-center"
                                        >
                                            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-stitch-surface-container-high">
                                                <ImageIcon className="h-12 w-12 text-stitch-outline/40" />
                                            </div>
                                            <h2 className="font-headline text-2xl font-bold text-stitch-on-surface-variant">
                                                Visual Vocabulary
                                            </h2>
                                            <p className="mt-2 max-w-md text-sm text-stitch-on-surface-variant/90">
                                                输入任意英文单词，生成配图与释义；结果可一键加入生词本。
                                            </p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <aside className="xl:col-span-3">
                                <div className="xl:sticky xl:top-4">
                                    <div className="rounded-3xl border border-[#c3c6d7]/10 bg-stitch-surface-container-low p-6">
                                        <div className="mb-6 flex items-center justify-between gap-2">
                                            <h2 className="font-headline text-xl font-bold text-stitch-on-surface">Saved Words</h2>
                                            <span className="rounded-lg bg-[#2563eb] px-2 py-0.5 text-xs font-bold text-[#eeefff]">
                                                {bankWords.length} Total
                                            </span>
                                        </div>
                                        <div className="max-h-[min(50vh,420px)] space-y-3 overflow-y-auto pr-1">
                                            {bankWords.length === 0 ? (
                                                <p className="text-sm text-stitch-on-surface-variant">生词本中暂无单词。</p>
                                            ) : (
                                                bankWords.slice(0, 12).map((w) => (
                                                    <button
                                                        key={w.id}
                                                        type="button"
                                                        onClick={() => setCurrentEntry(w)}
                                                        className="flex w-full items-center gap-4 rounded-2xl bg-stitch-surface-container-lowest p-3 text-left transition-transform hover:translate-x-1"
                                                    >
                                                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-stitch-surface-container-high">
                                                            {w.images?.[0] ? (
                                                                <img
                                                                    src={w.images[0]}
                                                                    alt=""
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center">
                                                                    <ImageIcon className="h-6 w-6 text-stitch-outline/40" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-bold text-stitch-on-surface">
                                                                {w.word}
                                                            </p>
                                                            <p className="truncate text-xs text-stitch-on-surface-variant">
                                                                {(w.synonyms && w.synonyms[0]) || w.translation || '—'}
                                                            </p>
                                                        </div>
                                                        <ChevronRight className="h-5 w-5 shrink-0 text-stitch-outline" />
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                toast('请从主导航打开「我的生词本」查看全部', 'default')
                                            }
                                            className="mt-6 w-full rounded-xl border-2 border-[#c3c6d7]/30 py-3 text-sm font-semibold text-stitch-on-surface-variant transition-colors hover:bg-stitch-surface-container-high"
                                        >
                                            View Library
                                        </button>
                                    </div>

                                    <div className="mt-6 rounded-3xl bg-gradient-to-br from-stitch-secondary to-stitch-on-secondary-container p-6 text-white shadow-xl shadow-stitch-secondary/20">
                                        <div className="mb-4 flex items-center gap-3">
                                            <TrendingUp className="h-5 w-5" />
                                            <span className="text-sm font-bold uppercase tracking-wider">Learning Stats</span>
                                        </div>
                                        <div className="font-headline mb-1 text-3xl font-black">{VISUAL_RETENTION_DISPLAY}%</div>
                                        <p className="mb-4 text-sm text-white/80">
                                            基于当前生词本词量的示意留存指数（展示用）。
                                        </p>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                                            <div
                                                className="h-full rounded-full bg-white"
                                                style={{ width: `${VISUAL_RETENTION_DISPLAY}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
