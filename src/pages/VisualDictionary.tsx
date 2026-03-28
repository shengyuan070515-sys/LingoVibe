import * as React from 'react';
import { Search, Loader2, Image as ImageIcon, PanelLeft, BookPlus, Check } from 'lucide-react';
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useWordBankStore, WordBankItem } from "@/store/wordBankStore";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { SearchHistorySidebar, SearchHistoryItem } from "@/components/visual-dictionary/SearchHistorySidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchUnsplashImages } from "@/lib/unsplash";
import { recordVisualLookup } from "@/store/learningAnalyticsStore";

export function VisualDictionaryPage() {
    const [chatApiKey] = useLocalStorage('chat_api_key', '');
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
        
        if (!chatApiKey) {
            console.error("[VisualDictionary] Missing DeepSeek API Key (chat_api_key)");
            toast("Please configure AI Chat API Key in Settings first.", "error");
            return;
        }

        setIsLoading(true);
        try {
            console.log(`[VisualDictionary] Starting search for: ${query}`);
            
            // Concurrent requests to LLM and Unsplash
            const [llmResponse, unsplashResponse] = await Promise.all([
                fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${chatApiKey}` 
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            { 
                                role: 'system', 
                                content: 'You are a visual dictionary assistant. Return ONLY JSON format.' 
                            },
                            { 
                                role: 'user', 
                                content: `For the word "${query}", provide: 
                                1. definition: a short English definition (under 15 words).
                                2. synonyms: 3 English synonyms.
                                3. color: a HEX color code representing the word's mood/vibe.
                                Format: {"definition": "...", "synonyms": ["...", "...", "..."], "color": "..."}` 
                            }
                        ],
                        response_format: { type: 'json_object' }
                    })
                }).catch(err => {
                    console.error("[VisualDictionary] DeepSeek API Fetch Error:", err);
                    return { ok: false, statusText: err.message } as Response;
                }),
                fetchUnsplashImages(query, { perPage: 3 })
            ]);

            if (llmResponse && !llmResponse.ok) {
                console.error("[VisualDictionary] DeepSeek API Error:", llmResponse.status, llmResponse.statusText);
                throw new Error(`DeepSeek API failed: ${llmResponse.statusText}`);
            }
            
            const llmData = await llmResponse!.json();
            const llmContent = JSON.parse(llmData.choices[0].message.content);
            
            const imageUrls = Array.isArray(unsplashResponse) ? unsplashResponse : [];

            console.log(`[VisualDictionary] Images for "${query}":`, imageUrls);

            const newEntry: Partial<Omit<WordBankItem, 'id' | 'addedAt' | 'nextReviewDate' | 'interval' | 'level'>> = {
                word: query.toLowerCase(),
                type: 'word',
                translation: llmContent.definition,
                synonyms: llmContent.synonyms || [],
                color: llmContent.color || '#F3F4F6',
                images: imageUrls,
            };
            
            setCurrentEntry({ ...newEntry, id: '', addedAt: Date.now(), nextReviewDate: Date.now(), interval: 1, level: 0 } as WordBankItem);

            // 添加到搜索历史（生词本仅可通过侧边栏记录上的「书本」按钮手动添加）
            addToSearchHistory(query);
            setQuery('');
            recordVisualLookup();
            
        } catch (error) {
            console.error(error);
            toast("Failed to search. Please check your API keys and network.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-0 h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl border bg-white md:h-[calc(100vh-8rem)] md:max-h-[calc(100vh-8rem)] md:flex-row md:rounded-3xl">
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

            {/* 主内容区域：可纵向滚动，避免底部按钮被裁切 */}
            <motion.div 
                className="relative flex min-h-0 min-w-0 flex-1 flex-col items-stretch overflow-y-auto overflow-x-hidden overscroll-contain transition-colors duration-500"
                animate={{ backgroundColor: currentEntry?.color || '#F9FAFB' }}
            >
            <div className="mx-auto w-full max-w-4xl space-y-8 px-3 pt-3 pb-8 sm:space-y-10 sm:px-6 sm:pt-4 sm:pb-10 md:space-y-12 md:pb-14">
                {/* Search Header with Toggle Button */}
                <div className="mx-auto w-full max-w-xl px-1 sm:px-4">
                    <div className="mb-3 flex items-center gap-2 sm:mb-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowHistory(!showHistory)}
                            className="h-10 shrink-0 border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                            <PanelLeft className="mr-1.5 h-4 w-4" />
                            <span className="text-xs font-medium sm:text-sm">{showHistory ? '隐藏' : '历史'}</span>
                        </Button>
                        <div className="truncate text-xs text-gray-500 sm:text-sm">
                            {searchHistory.length} 条记录
                        </div>
                    </div>
                    
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="输入单词，探索视觉释义…"
                            className="w-full rounded-full border-none bg-white/80 py-3.5 pl-5 pr-14 text-base shadow-xl backdrop-blur-md transition-all focus:ring-2 focus:ring-black/10 sm:px-6 sm:py-4 sm:pr-16 sm:text-lg"
                        />
                        <button 
                            onClick={handleSearch}
                            disabled={isLoading}
                            className="absolute right-1.5 top-1.5 p-2.5 text-white bg-black rounded-full transition-transform hover:scale-105 disabled:opacity-50 sm:right-2 sm:top-2 sm:p-3"
                        >
                            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                        </button>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {isLoading ? (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center space-y-4 py-20"
                        >
                            <div className="relative h-16 w-16">
                                <motion.div 
                                    className="absolute inset-0 rounded-full border-4 border-black/10"
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                                <Loader2 className="h-16 w-16 animate-spin text-black/40" />
                            </div>
                            <p className="text-black/40 font-bold tracking-widest uppercase text-xs animate-pulse">
                                Fetching Visual Essence...
                            </p>
                        </motion.div>
                    ) : currentEntry ? (
                        <motion.div
                            key={currentEntry.word}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-8"
                        >
                            {/* Image Carousel/Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[200px] h-[min(400px,42vh)] md:h-[400px]">
                                {(currentEntry.images ?? []).map((img: string, idx: number) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="relative rounded-2xl overflow-hidden shadow-2xl group bg-black/5"
                                    >
                                        <img 
                                            src={img} 
                                            alt={currentEntry.word} 
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.onerror = null; // 避免死循环
                                                target.src = `https://images.unsplash.com/photo-1518623489648-a173ef7824f3?auto=format&fit=crop&w=800&q=80&sig=fallback_${idx}`;
                                                target.className = target.className + " opacity-50 grayscale";
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                                    </motion.div>
                                ))}
                            </div>

                            {/* Word Details */}
                            <div className="text-center space-y-4 backdrop-blur-md bg-white/30 p-6 sm:p-8 rounded-3xl border border-white/20 shadow-sm pb-8">
                                <h1 className="break-words text-3xl font-black uppercase tracking-tighter text-black sm:text-5xl md:text-6xl">{currentEntry.word}</h1>
                                <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-black/70 sm:text-xl">
                                    {currentEntry.translation}
                                </p>
                                <div className="flex flex-wrap justify-center gap-3 pt-4">
                                    {(currentEntry.synonyms ?? []).map((syn: string) => (
                                        <span key={syn} className="px-4 py-2 bg-black/10 backdrop-blur-sm rounded-full text-sm font-bold text-black/60 hover:bg-black/20 cursor-default transition-colors">
                                            {syn}
                                        </span>
                                    ))}
                                </div>
                                <div className="pt-6 flex justify-center">
                                    <Button
                                        type="button"
                                        variant={isCurrentInWordBank ? 'outline' : 'default'}
                                        className={cn(
                                            'rounded-full px-6 h-11 gap-2 font-semibold shadow-sm',
                                            isCurrentInWordBank
                                                ? 'border-stone-200 bg-white/60 text-stone-600 cursor-default'
                                                : 'bg-black text-white hover:bg-black/90'
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
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-20 space-y-4"
                        >
                            <div className="bg-black/5 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                                <ImageIcon className="h-12 w-12 text-black/20" />
                            </div>
                            <h2 className="text-3xl font-bold text-black/40">Visual Dictionary</h2>
                            <p className="text-black/30 font-medium">Type any word to explore its visual essence</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* History Feed - Optional minimalist list */}
            {words.length > 0 && !currentEntry && (
                <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex gap-4 overflow-x-auto p-4 max-w-full no-scrollbar">
                    {words.filter(w => w.type === 'word').slice(0, 5).map((entry) => (
                        <button 
                            key={entry.id}
                            onClick={() => setCurrentEntry(entry)}
                            className="px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full text-xs font-bold text-black/50 hover:bg-white transition-colors shadow-sm whitespace-nowrap"
                        >
                            {entry.word}
                        </button>
                    ))}
                </div>
            )}
        </motion.div>
    </div>
);
}
