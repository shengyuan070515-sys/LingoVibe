import { useNavigate } from 'react-router-dom';
import * as React from 'react';
import { useWordBankStore, WordBankItem } from "@/store/wordBankStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Book, ChevronLeft, ChevronRight, Layers, Pencil, Search, Trash2, Volume2, Wand2 } from 'lucide-react';
import { WordDetailModal } from '@/components/word-detail-modal';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { speakEnglish } from '@/lib/speak-english';
import type { WordBankSortMode } from '@/store/wordBankStore';

/** 每页最多显示的词条数，满页后进入下一页 */
const WORD_BANK_PAGE_SIZE = 12;

export function WordBankPage() {
    const navigate = useNavigate();
    const { words, clearAllWords, removeWord, dedupeWords, sortWords, removeInvalidWords } = useWordBankStore();
    const { toast } = useToast();
    const [selectedWord, setSelectedWord] = React.useState<WordBankItem | null>(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterType, setFilterType] = React.useState<'all' | 'word' | 'sentence'>('all');
    const [speakingId, setSpeakingId] = React.useState<string | null>(null);
    const [imageTick, setImageTick] = React.useState(0);
    const [autoRotate, setAutoRotate] = React.useState(true);
    const [rotateSeconds, setRotateSeconds] = React.useState<15 | 30 | 60 | 300 | 600>(300);
    const [manualImageOffset, setManualImageOffset] = React.useState<Record<string, number>>({});
    const [listPage, setListPage] = React.useState(1);
    const listTopRef = React.useRef<HTMLDivElement>(null);
    const LIST_IMAGE_ROTATE_MS = rotateSeconds * 1000;

    // 安全过滤，防止 words 不是数组或 item 为空
    const safeWords = React.useMemo(() => {
        if (!Array.isArray(words)) return [];
        return words.filter(item => item && typeof item === 'object' && item.word);
    }, [words]);

    // 过滤和搜索 【核心修复：增加了极其严密的防崩溃保护】
    const filteredWords = React.useMemo(() => {
        return safeWords.filter(item => {
            const matchesType = filterType === 'all' || item.type === filterType;
            
            // 如果搜索框是空的，直接显示
            if (searchTerm === '') return matchesType;

            // 安全地进行搜索，即使没有翻译也不会报错崩溃
            const safeWord = item.word ? item.word.toLowerCase() : '';
            const safeTranslation = item.translation ? item.translation.toLowerCase() : '';
            const searchLower = searchTerm.toLowerCase();

            const matchesSearch = safeWord.includes(searchLower) || safeTranslation.includes(searchLower);
            
            return matchesType && matchesSearch;
        });
    }, [safeWords, searchTerm, filterType]);

    const totalListPages = Math.max(1, Math.ceil(filteredWords.length / WORD_BANK_PAGE_SIZE));

    React.useEffect(() => {
        setListPage(1);
    }, [searchTerm, filterType]);

    React.useEffect(() => {
        setListPage((p) => Math.min(p, totalListPages));
    }, [totalListPages]);

    const paginatedWords = React.useMemo(() => {
        const start = (listPage - 1) * WORD_BANK_PAGE_SIZE;
        return filteredWords.slice(start, start + WORD_BANK_PAGE_SIZE);
    }, [filteredWords, listPage]);

    const selectedWordLive = React.useMemo(() => {
        if (!selectedWord) return null;
        const latest = safeWords.find(w => w.id === selectedWord.id);
        return latest || selectedWord;
    }, [selectedWord, safeWords]);

    React.useEffect(() => {
        if (!autoRotate) return;
        const timer = window.setInterval(() => {
            setImageTick((t) => t + 1);
        }, LIST_IMAGE_ROTATE_MS);
        return () => window.clearInterval(timer);
    }, [LIST_IMAGE_ROTATE_MS, autoRotate]);

    const goListPage = React.useCallback(
        (next: number) => {
            const clamped = Math.min(Math.max(1, next), totalListPages);
            setListPage(clamped);
            listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        [totalListPages]
    );

    return (
        <div className="min-h-screen max-w-full min-w-0 overflow-x-hidden bg-gray-50 px-3 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:px-4 sm:py-5 md:p-6">
            {/* Header */}
            <div className="mb-6 sm:mb-8 min-w-0">
                <div className="mb-3 flex min-w-0 items-start gap-2 sm:mb-4 sm:items-center sm:gap-3">
                    <Book className="h-7 w-7 shrink-0 text-blue-600 sm:h-8 sm:w-8" />
                    <h1 className="min-w-0 break-words text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
                        我的生词本
                    </h1>
                </div>
                <p className="mb-4 text-sm text-gray-600 sm:mb-5 sm:text-base">
                    这里收藏了您在学习过程中遇到的所有生词和例句
                </p>

                {(
                    <div className="mb-5 sm:mb-6">
                        <Button
                            type="button"
                            className="w-full gap-2 bg-teal-600 hover:bg-teal-700 sm:w-auto"
                            onClick={() => navigate('/flashcard')}
                        >
                            <Layers className="h-4 w-4" />
                            闪卡复习（今日到期词）
                        </Button>
                    </div>
                )}

                {safeWords.length > 0 && (
                    <div className="mb-5 max-w-full min-w-0 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-white p-3 shadow-sm sm:mb-6 sm:p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-indigo-900">
                            <Wand2 className="h-4 w-4 shrink-0 text-indigo-600" />
                            <span className="min-w-0">整理生词本</span>
                        </div>
                        <p className="mb-3 text-xs leading-relaxed text-indigo-800/85">
                            同一单词若存了多条，可用「去重」合并成一条（任选保留释义更全的，或保留最近添加的）。「排序」调整列表顺序。「移除空条目」删掉没有内容的卡片。
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:flex-wrap">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-w-0 border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50"
                                    onClick={() => {
                                        const n = dedupeWords('keep-rich');
                                        toast(
                                            n > 0 ? `已合并 ${n} 条重复，保留信息最全的一条` : '当前没有可合并的重复项',
                                            n > 0 ? 'success' : 'default'
                                        );
                                    }}
                                >
                                    去重 · 保全书
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-w-0 border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50"
                                    onClick={() => {
                                        const n = dedupeWords('keep-newest');
                                        toast(
                                            n > 0 ? `已合并 ${n} 条重复，保留最近添加的一条` : '当前没有可合并的重复项',
                                            n > 0 ? 'success' : 'default'
                                        );
                                    }}
                                >
                                    去重 · 保最新
                                </Button>
                            </div>
                            <select
                                className="h-9 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:w-auto sm:max-w-[min(100%,14rem)]"
                                defaultValue=""
                                onChange={(e) => {
                                    const v = e.target.value as WordBankSortMode | '';
                                    if (!v) return;
                                    const labels: Record<WordBankSortMode, string> = {
                                        'added-desc': '最近添加优先',
                                        'added-asc': '最早添加优先',
                                        alpha: '按字母 A–Z',
                                        'review-soon': '即将复习优先',
                                        'level-desc': '掌握等级从高到低',
                                    };
                                    sortWords(v);
                                    toast(`已排序：${labels[v]}`, 'success');
                                    e.target.value = '';
                                }}
                            >
                                <option value="" disabled>
                                    选择排序方式…
                                </option>
                                <option value="added-desc">最近添加优先</option>
                                <option value="added-asc">最早添加优先</option>
                                <option value="alpha">按字母 A–Z</option>
                                <option value="review-soon">即将复习优先</option>
                                <option value="level-desc">掌握等级优先</option>
                            </select>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-center text-gray-600 hover:text-gray-900 sm:w-auto"
                                onClick={() => {
                                    const n = removeInvalidWords();
                                    toast(
                                        n > 0 ? `已移除 ${n} 条无效空卡片` : '没有需要移除的空条目',
                                        n > 0 ? 'success' : 'default'
                                    );
                                }}
                            >
                                移除空条目
                            </Button>
                        </div>
                    </div>
                )}

                {/* Search and Filter */}
                <div className="mb-6 flex min-w-0 flex-col gap-3 sm:gap-4">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="搜索单词或翻译..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full min-w-0 rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-base sm:text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Button
                            variant={filterType === 'all' ? 'default' : 'outline'}
                            size="sm"
                            className="shrink-0"
                            onClick={() => setFilterType('all')}
                        >
                            全部
                        </Button>
                        <Button
                            variant={filterType === 'word' ? 'default' : 'outline'}
                            size="sm"
                            className="shrink-0"
                            onClick={() => setFilterType('word')}
                        >
                            单词
                        </Button>
                        <Button
                            variant={filterType === 'sentence' ? 'default' : 'outline'}
                            size="sm"
                            className="shrink-0"
                            onClick={() => setFilterType('sentence')}
                        >
                            例句
                        </Button>
                        {safeWords.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 text-red-500 border-red-200 hover:bg-red-50"
                                onClick={() => {
                                    if (confirm('确定要清空所有生词吗？此操作不可恢复。')) {
                                        clearAllWords();
                                    }
                                }}
                            >
                                清空生词
                            </Button>
                        )}
                    </div>

                    <div
                        className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-2 shadow-sm"
                        role="group"
                        aria-label="卡片配图自动切换"
                    >
                        <span className="w-full text-[11px] font-medium text-gray-500 sm:w-auto sm:pr-1">
                            配图轮播
                        </span>
                        <button
                            type="button"
                            onClick={() => setAutoRotate((v) => !v)}
                            className={[
                                'shrink-0 rounded-md px-2 py-1.5 text-xs transition-colors',
                                autoRotate ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100',
                            ].join(' ')}
                            title="自动切换配图开关"
                        >
                            自动切图
                        </button>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:flex-initial">
                            {(
                                [
                                    { sec: 15 as const, label: '15s', title: '每 15 秒' },
                                    { sec: 30 as const, label: '30s', title: '每 30 秒' },
                                    { sec: 60 as const, label: '1m', title: '每 1 分钟' },
                                    { sec: 300 as const, label: '5m', title: '每 5 分钟' },
                                    { sec: 600 as const, label: '10m', title: '每 10 分钟' },
                                ] as const
                            ).map(({ sec, label, title }) => (
                                <button
                                    key={sec}
                                    type="button"
                                    onClick={() => setRotateSeconds(sec)}
                                    className={[
                                        'shrink-0 rounded-md px-2 py-1.5 text-xs transition-colors',
                                        rotateSeconds === sec ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100',
                                    ].join(' ')}
                                    title={title}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Word List */}
            <div ref={listTopRef} className="scroll-mt-4" />
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {paginatedWords.map((item) => (
                    <Card
                        key={item.id}
                        className="group relative h-[186px] cursor-pointer overflow-hidden border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg md:hover:scale-[1.02]"
                        onClick={() => setSelectedWord(item)}
                    >
                        <CardContent className="p-0 h-full">
                            {(() => {
                                const images = Array.isArray(item.images) ? item.images : [];
                                const base = manualImageOffset[item.id] || 0;
                                const auto = autoRotate ? imageTick : 0;
                                const currentIndex = images.length > 0 ? (base + auto) % images.length : 0;
                                const currentImage = images.length > 0 ? images[currentIndex] : '';
                                const onImage = Boolean(currentImage);
                                return (
                            <div
                                className={cn(
                                    'relative h-full',
                                    !onImage && 'bg-gradient-to-br from-slate-100 via-white to-indigo-50/50'
                                )}
                            >
                                {/* full-card image layer */}
                                {currentImage && (
                                    <div className="absolute inset-0">
                                        <img
                                            src={currentImage}
                                            alt={`${item.word} background`}
                                            className="h-full w-full object-cover scale-[1.08] group-hover:scale-[1.14] transition-transform duration-[8000ms] ease-out brightness-[0.9] saturate-[0.9] contrast-[1.05]"
                                        />
                                        {/* readability overlay: transparent top, darker bottom */}
                                        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/50" />
                                    </div>
                                )}

                                {/* content layer */}
                                <div className="relative z-10 flex h-full max-w-[92%] flex-col p-4 sm:max-w-[82%]">
                                    <div className="mb-2 flex items-start justify-between">
                                        <div className="min-w-0 flex-1">
                                    <h3
                                        className={cn(
                                            'mb-1 text-lg font-semibold',
                                            onImage ? 'text-white' : 'text-slate-900'
                                        )}
                                        style={onImage ? { textShadow: '0 2px 8px rgba(0,0,0,0.6)' } : undefined}
                                    >
                                        {item.word}
                                    </h3>
                                    
                                    <p
                                        className={cn(
                                            'mb-1 text-sm leading-relaxed',
                                            onImage ? 'text-white' : 'text-slate-700'
                                        )}
                                        style={{
                                            ...(onImage ? { textShadow: '0 2px 8px rgba(0,0,0,0.6)' } : {}),
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {item.translation ? item.translation : '翻译加载中...'}
                                    </p>
                                    
                                    {item.phonetic && (
                                        <p
                                            className={cn(
                                                'mb-2 text-xs',
                                                onImage ? 'text-white/95' : 'text-slate-600'
                                            )}
                                            style={{
                                                ...(onImage ? { textShadow: '0 2px 8px rgba(0,0,0,0.6)' } : {}),
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {item.phonetic}
                                        </p>
                                    )}
                                    {item.pos && (
                                        <span
                                            className={cn(
                                                'inline-block rounded px-2 py-1 text-xs',
                                                onImage
                                                    ? 'border border-white/20 bg-black/30 text-white'
                                                    : 'border border-slate-200 bg-white/90 text-slate-700'
                                            )}
                                            style={onImage ? { textShadow: '0 2px 8px rgba(0,0,0,0.6)' } : undefined}
                                        >
                                            {item.pos}
                                        </span>
                                    )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSpeakingId(item.id);
                                            void speakEnglish(item.word).finally(() => setSpeakingId(null));
                                        }}
                                        className={
                                            speakingId === item.id
                                                ? 'text-blue-600'
                                                : onImage
                                                  ? 'text-white/90 hover:text-blue-300'
                                                  : 'text-slate-500 hover:text-blue-600'
                                        }
                                    >
                                        <Volume2 className="h-4 w-4" />
                                    </Button>

                                    <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedWord(item);
                                            }}
                                            className={onImage ? 'text-white/80 hover:text-white' : 'text-gray-500 hover:text-gray-800'}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const ok = confirm(`确定删除「${item.word}」吗？此操作不可恢复。`);
                                                if (ok) removeWord(item.id);
                                            }}
                                            className={onImage ? 'text-white/80 hover:text-red-300' : 'text-gray-500 hover:text-red-500'}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                        </div>
                                    </div>
                            
                            <div className="mt-auto">
                            {item.exampleSentence && (
                                <div
                                    className={cn(
                                        'border-t pt-2',
                                        onImage ? 'border-black/10' : 'border-slate-200'
                                    )}
                                >
                                    <p
                                        className={cn(
                                            'text-sm italic leading-relaxed',
                                            onImage ? 'text-white' : 'text-slate-600'
                                        )}
                                        style={onImage ? { textShadow: '0 2px 8px rgba(0,0,0,0.6)' } : undefined}
                                    >
                                        {item.exampleSentence}
                                    </p>
                                </div>
                            )}
                            </div>
                                </div>
                                {images.length > 1 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setManualImageOffset((prev) => ({
                                                ...prev,
                                                [item.id]: ((prev[item.id] || 0) + 1) % images.length,
                                            }));
                                        }}
                                        className="absolute right-3 bottom-3 z-20 h-8 w-8 rounded-full bg-white/85 backdrop-blur border border-white shadow-sm text-gray-600 hover:text-gray-900 hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                                        title="手动切换图片"
                                        aria-label="手动切换图片"
                                    >
                                        <ChevronRight className="h-4 w-4 mx-auto" />
                                    </button>
                                )}
                            </div>
                                );
                            })()}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {filteredWords.length > WORD_BANK_PAGE_SIZE && (
                <div className="mt-6 flex min-w-0 flex-col items-center gap-3 px-1 sm:flex-row sm:justify-center sm:gap-4">
                    <p className="order-2 max-w-full text-center text-sm text-gray-600 sm:order-1">
                        第 {listPage} / {totalListPages} 页，共 {filteredWords.length} 条（每页 {WORD_BANK_PAGE_SIZE} 条）
                    </p>
                    <div className="flex items-center gap-2 order-1 sm:order-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={listPage <= 1}
                            onClick={() => goListPage(listPage - 1)}
                            className="min-w-[88px]"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            上一页
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={listPage >= totalListPages}
                            onClick={() => goListPage(listPage + 1)}
                            className="min-w-[88px]"
                        >
                            下一页
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {filteredWords.length === 0 && (
                <div className="text-center py-12">
                    <Book className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-500 mb-2">
                        {searchTerm ? '没有找到匹配的内容' : '生词本为空'}
                    </h3>
                    <p className="text-gray-400">
                        {searchTerm ? '尝试不同的搜索词或筛选条件' : '开始学习并收藏生词吧！'}
                    </p>
                </div>
            )}

            {/* Word Detail Modal */}
            {selectedWordLive && (
                <WordDetailModal
                    word={selectedWordLive}
                    isOpen={!!selectedWord}
                    onClose={() => setSelectedWord(null)}
                />
            )}
        </div>
    );
}