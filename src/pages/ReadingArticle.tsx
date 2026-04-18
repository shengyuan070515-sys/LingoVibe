import * as React from 'react';
import { createPortal } from 'react-dom';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    ArrowLeft,
    BookMarked,
    BookmarkCheck,
    BookmarkPlus,
    Eye,
    EyeOff,
    Languages,
    Loader2,
    Sparkles,
    Square,
    Volume2,
} from 'lucide-react';
import { useReadingBrowseComplete } from '@/hooks/use-reading-browse-complete';
import { fetchEnglishToChineseTranslation } from '@/lib/ai-chat';
import { fetchReadingGrammarNotes, fetchReadingWordCard, type ReadingWordCardData } from '@/lib/reading-ai';
import { stripMarkdownInlineLinks } from '@/lib/reading-content-sanitize';
import { stripJinaReaderPreamble } from '@/lib/reading-jina-strip';
import {
    classifyReadingSelection,
    extractContextSnippet,
    soleEnglishTokenFromSelection,
} from '@/lib/reading-selection';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ReadingWordCardModal } from '@/components/reading/reading-word-card-modal';
import { ReadingVocabCards } from '@/components/reading/reading-vocab-cards';
import { ReadingQuiz } from '@/components/reading/reading-quiz';
import { WordDetailModal } from '@/components/word-detail-modal';
import { useReadingLibraryStore, type ReadingArticle as RA } from '@/store/readingLibraryStore';
import { useWordBankStore } from '@/store/wordBankStore';
import { recordReadingSession } from '@/store/learningAnalyticsStore';
import { syncDailyLoopDate, useDailyLoopStore } from '@/store/dailyLoopStore';
import { useEnglishTts } from '@/hooks/use-english-tts';
import { planHighlightSegments, type HighlightSegment } from '@/lib/reading-highlight';
import { SelectionInsightPanel, type InsightTab } from '@/components/reading/selection-insight-panel';

const DIFF_LABELS: Record<number, string> = {
    1: '入门',
    2: '基础',
    3: '中级',
    4: '进阶',
    5: '高阶',
};

const SHOW_SAVED_HL_KEY = 'lingovibe_reading_show_saved_highlights';

function readSavedHlPref(): boolean {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(SHOW_SAVED_HL_KEY);
    if (raw === null) return true;
    return raw === '1';
}

function writeSavedHlPref(v: boolean): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_SAVED_HL_KEY, v ? '1' : '0');
}

function renderSegments(
    segments: HighlightSegment[],
    handlers: {
        onPhraseClick: (term: string, e: React.MouseEvent<HTMLElement>) => void;
        onKeyWordClick: (term: string, e: React.MouseEvent<HTMLElement>) => void;
        onSavedClick: (term: string, e: React.MouseEvent<HTMLElement>) => void;
    }
): React.ReactNode[] {
    return segments.map((seg, i) => {
        if (seg.kind === 'none') return seg.text;
        const base = 'cursor-pointer rounded-sm transition-colors';
        if (seg.kind === 'phrase') {
            return (
                <mark
                    key={i}
                    data-term={seg.term}
                    className={`${base} bg-yellow-200/80 px-1 py-0.5 hover:bg-yellow-300/90 text-inherit`}
                    onClick={(e) => handlers.onPhraseClick(seg.term!, e)}
                >
                    {seg.text}
                </mark>
            );
        }
        if (seg.kind === 'keyword') {
            return (
                <span
                    key={i}
                    data-term={seg.term}
                    className={`${base} bg-teal-50 px-0.5 underline decoration-teal-500 decoration-dashed decoration-2 underline-offset-[3px] hover:bg-teal-100 hover:decoration-solid`}
                    onClick={(e) => handlers.onKeyWordClick(seg.term!, e)}
                >
                    {seg.text}
                </span>
            );
        }
        return (
            <span
                key={i}
                data-term={seg.term}
                className={`${base} bg-slate-100 px-0.5 underline decoration-slate-400 decoration-dotted decoration-2 underline-offset-[3px] hover:bg-slate-200 hover:decoration-solid`}
                onClick={(e) => handlers.onSavedClick(seg.term!, e)}
            >
                {seg.text}
            </span>
        );
    });
}

function transformChildren(
    children: React.ReactNode,
    plan: (text: string) => HighlightSegment[],
    handlers: Parameters<typeof renderSegments>[1]
): React.ReactNode {
    return React.Children.map(children, (child) => {
        if (typeof child === 'string') {
            return renderSegments(plan(child), handlers);
        }
        if (React.isValidElement(child)) {
            // Avoid corrupting semantics in inline code / links.
            if (typeof child.type === 'string' && (child.type === 'code' || child.type === 'a')) {
                return child;
            }
            const inner = (child.props as { children?: React.ReactNode }).children;
            if (inner == null) return child;
            return React.cloneElement(child, undefined, transformChildren(inner, plan, handlers));
        }
        return child;
    });
}

function nodeInside(el: HTMLElement | null, node: Node | null): boolean {
    if (!el || !node) return false;
    let cur: Node | null = node;
    while (cur) {
        if (cur === el) return true;
        cur = cur.parentNode;
    }
    return false;
}

type SelBubble =
    | {
          left: number;
          top: number;
          text: string;
          kind: 'word' | 'sentence';
          rect?: DOMRect | null;
      }
    | null;

export function ReadingArticleView({
    articleId,
    onBack,
}: {
    articleId: string;
    onBack: () => void;
}) {
    const article = useReadingLibraryStore((s) => s.getById(articleId));
    const updateDifficulty = useReadingLibraryStore((s) => s.updateDifficulty);
    const setAddedToLibrary = useReadingLibraryStore((s) => s.setAddedToLibrary);
    const addWord = useWordBankStore((s) => s.addWord);
    const savedWordsList = useWordBankStore((s) => s.words);
    const { toast } = useToast();
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const [fullZh, setFullZh] = React.useState<string | null>(null);
    const [fullZhOpen, setFullZhOpen] = React.useState(false);
    const [transLoading, setTransLoading] = React.useState(false);

    const [bubble, setBubble] = React.useState<SelBubble>(null);
    const [wordCardWord, setWordCardWord] = React.useState<string | null>(null);
    const [showSavedHl, setShowSavedHl] = React.useState<boolean>(() => readSavedHlPref());
    const [detailModalWordId, setDetailModalWordId] = React.useState<string | null>(null);
    const [insight, setInsight] = React.useState<{
        open: boolean;
        sentence: string;
        tab: InsightTab;
        rect: DOMRect | null;
        openedAtScrollTop: number;
    } | null>(null);

    const wordCardCache = React.useRef<Map<string, ReadingWordCardData>>(new Map());

    const loggedRef = React.useRef(false);

    const summaryMode = !!(article?.summaryOnly && article?.summaryText?.trim());

    const displayBody = React.useMemo(() => {
        if (summaryMode && article?.summaryText) {
            return stripMarkdownInlineLinks(article.summaryText.trim());
        }
        const raw = stripJinaReaderPreamble(article?.content ?? '');
        return stripMarkdownInlineLinks(raw);
    }, [article?.content, article?.summaryText, summaryMode]);

    const savedWordSet = React.useMemo(() => {
        const s = new Set<string>();
        for (const w of savedWordsList) {
            if (w?.type === 'word' && w.word?.trim()) s.add(w.word.trim().toLowerCase());
        }
        return s;
    }, [savedWordsList]);

    const savedWordRecord = React.useMemo(() => {
        const m = new Map<string, string>();
        for (const w of savedWordsList) {
            if (w?.type === 'word' && w.word?.trim()) {
                m.set(w.word.trim().toLowerCase(), w.id);
            }
        }
        return m;
    }, [savedWordsList]);

    const keyWordsList = React.useMemo(
        () => (article?.keyVocabulary ?? []).map((v) => v.word).filter(Boolean),
        [article?.keyVocabulary]
    );

    const phrasesList = React.useMemo(() => article?.keyPhrases ?? [], [article?.keyPhrases]);

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);

    const onBrowseComplete = React.useCallback(() => {
        if (loggedRef.current) return;
        loggedRef.current = true;
        useDailyLoopStore.getState().markReadingDone();
        recordReadingSession();
        toast('已完成本文浏览要求，今日阅读闭环已更新', 'success');
    }, [toast]);

    const { progressLabel } = useReadingBrowseComplete(scrollRef, displayBody, onBrowseComplete, {
        summaryMode,
    });

    const articleTts = useEnglishTts(displayBody);

    const refreshBubbleFromSelection = React.useCallback(() => {
        const root = scrollRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
            setBubble(null);
            return;
        }
        const text = sel.toString().trim();
        if (!text) {
            setBubble(null);
            return;
        }
        if (!nodeInside(root, sel.anchorNode)) {
            setBubble(null);
            return;
        }

        const kind = classifyReadingSelection(text);
        if (kind === 'chinese_only') {
            setBubble(null);
            toast('请划选英文单词或句子', 'default');
            return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const pad = 8;
        const w = 220;
        const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, pad), window.innerWidth - w - pad);
        const top = Math.max(rect.top - 42, pad);

        setBubble({
            left,
            top,
            text,
            kind,
            rect,
        });
    }, [toast]);

    const plan = React.useCallback(
        (text: string) =>
            planHighlightSegments(text, {
                phrases: phrasesList,
                keyWords: keyWordsList,
                savedWords: showSavedHl ? savedWordSet : new Set<string>(),
            }),
        [phrasesList, keyWordsList, savedWordSet, showSavedHl]
    );

    const openBubbleFor = React.useCallback(
        (term: string, kind: 'word' | 'sentence', e: React.MouseEvent<HTMLElement>) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const pad = 8;
            const w = 220;
            const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, pad), window.innerWidth - w - pad);
            const top = Math.max(rect.top - 42, pad);
            setBubble({ left, top, text: term, kind, rect });
        },
        []
    );

    const handleSavedClick = React.useCallback(
        (term: string) => {
            const id = savedWordRecord.get(term);
            if (id) setDetailModalWordId(id);
        },
        [savedWordRecord]
    );

    const openInsight = React.useCallback(
        (sentence: string, tab: InsightTab) => {
            const rect = bubble?.rect ?? null;
            setBubble(null);
            setInsight({
                open: true,
                sentence,
                tab,
                rect,
                openedAtScrollTop: scrollRef.current?.scrollTop ?? 0,
            });
        },
        [bubble?.rect]
    );

    React.useEffect(() => {
        const onMouseUp = () => {
            window.requestAnimationFrame(() => refreshBubbleFromSelection());
        };
        document.addEventListener('mouseup', onMouseUp);
        return () => document.removeEventListener('mouseup', onMouseUp);
    }, [refreshBubbleFromSelection]);

    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            setBubble(null);
            setInsight((prev) => {
                if (!prev || !prev.open) return prev;
                const currentTop = scrollRef.current?.scrollTop ?? 0;
                if (Math.abs(currentTop - prev.openedAtScrollTop) > 80) return null;
                return prev;
            });
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [article?.id, displayBody]);

    React.useEffect(() => {
        const close = (e: MouseEvent) => {
            const t = e.target;
            if (t instanceof Node && scrollRef.current?.contains(t)) return;
            const el = document.getElementById('reading-sel-bubble');
            if (el && t instanceof Node && el.contains(t)) return;
            setBubble(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const articleContextLabel = article ? `每日阅读 · ${article.sourceTitle}` : '每日阅读';

    const handleTranslateFull = async () => {
        if (!article) return;
        setTransLoading(true);
        try {
            const chunk = displayBody.slice(0, 12000);
            const zh = await fetchEnglishToChineseTranslation(chunk);
            setFullZh(zh || '（无译文）');
            setFullZhOpen(true);
        } catch (e) {
            toast(e instanceof Error ? e.message : '翻译失败', 'error');
        } finally {
            setTransLoading(false);
        }
    };

    const readingMarkdownComponents = React.useMemo<Components>(() => {
        const handlers = {
            onPhraseClick: (term: string, e: React.MouseEvent<HTMLElement>) =>
                openBubbleFor(term, 'sentence', e),
            onKeyWordClick: (term: string, e: React.MouseEvent<HTMLElement>) =>
                openBubbleFor(term, 'word', e),
            onSavedClick: (term: string, e: React.MouseEvent<HTMLElement>) => {
                e.preventDefault();
                e.stopPropagation();
                handleSavedClick(term);
            },
        };

        return {
            a({ node: _n, children, className, href, ...rest }) {
                return (
                    <a
                        {...rest}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            className,
                            'break-words text-teal-700 underline-offset-2 hover:underline'
                        )}
                    >
                        {children}
                    </a>
                );
            },
            img({ node: _n, className, alt, ...rest }) {
                return (
                    <img
                        {...rest}
                        alt={alt ?? ''}
                        loading="lazy"
                        className={cn(
                            className,
                            'max-h-[min(50svh,420px)] w-auto max-w-full rounded-lg shadow-sm'
                        )}
                    />
                );
            },
            p({ node: _n, children, ...rest }) {
                return <p {...rest}>{transformChildren(children, plan, handlers)}</p>;
            },
            li({ node: _n, children, ...rest }) {
                return <li {...rest}>{transformChildren(children, plan, handlers)}</li>;
            },
            blockquote({ node: _n, children, ...rest }) {
                return <blockquote {...rest}>{transformChildren(children, plan, handlers)}</blockquote>;
            },
        };
    }, [handleSavedClick, openBubbleFor, plan]);

    const openWordCard = (sel: string) => {
        const w = soleEnglishTokenFromSelection(sel);
        if (!w) return;
        setBubble(null);
        setWordCardWord(w);
    };

    const addWordFromBubble = async (sel: string) => {
        const w = soleEnglishTokenFromSelection(sel);
        if (!w) return;
        setBubble(null);
        let card = wordCardCache.current.get(w.toLowerCase());
        if (!card) {
            try {
                const snip = extractContextSnippet(displayBody.replace(/\s+/g, ' '), sel.slice(0, 120));
                card = await fetchReadingWordCard(w, snip);
                wordCardCache.current.set(w.toLowerCase(), card);
            } catch (e) {
                toast(e instanceof Error ? e.message : '查词失败', 'error');
                return;
            }
        }
        await addWord({
            word: w,
            type: 'word',
            phonetic: card.phonetic,
            pos: card.pos,
            translation: card.definitionZh,
            exampleSentence: card.exampleEn,
            exampleTranslation: card.exampleZh,
            context: articleContextLabel,
        });
        toast('已加入生词本', 'success');
    };

    async function handleWordCardAdd(data: ReadingWordCardData) {
        const w = wordCardWord?.trim();
        if (!w) return;
        wordCardCache.current.set(w.toLowerCase(), data);
        await addWord({
            word: w,
            type: 'word',
            phonetic: data.phonetic,
            pos: data.pos,
            translation: data.definitionZh,
            exampleSentence: data.exampleEn,
            exampleTranslation: data.exampleZh,
            context: articleContextLabel,
        });
        toast('已加入生词本', 'success');
        setWordCardWord(null);
    }

    if (!article) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-slate-600">找不到该文章。</p>
                <Button type="button" variant="outline" onClick={onBack}>
                    返回
                </Button>
            </div>
        );
    }

    const bubblePortal =
        bubble &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                id="reading-sel-bubble"
                className="fixed z-[45] flex w-[min(100vw-16px,220px)] flex-wrap justify-center gap-1 rounded-xl border border-slate-200 bg-white/98 p-1 shadow-lg backdrop-blur-sm"
                style={{ left: bubble.left, top: bubble.top }}
            >
                {bubble.kind === 'word' ? (
                    <>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-9 flex-1 text-xs"
                            onClick={() => openWordCard(bubble.text)}
                        >
                            <Sparkles className="mr-1 h-3 w-3" />
                            翻译
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 flex-1 text-xs"
                            onClick={() => void addWordFromBubble(bubble.text)}
                        >
                            <BookMarked className="mr-1 h-3 w-3" />
                            加入生词本
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-9 flex-1 text-xs"
                            onClick={() => openInsight(bubble.text, 'translate')}
                        >
                            <Languages className="mr-1 h-3 w-3" />
                            翻译（中文）
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 flex-1 text-xs"
                            onClick={() => openInsight(bubble.text, 'grammar')}
                        >
                            语法分析
                        </Button>
                    </>
                )}
            </div>,
            document.body
        );

    const hasSidebar =
        (article.keyVocabulary && article.keyVocabulary.length > 0) ||
        (article.quiz && article.quiz.length > 0);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            {bubblePortal}

            {insight?.open ? (
                <SelectionInsightPanel
                    open
                    sentence={insight.sentence}
                    anchorRect={insight.rect}
                    initialTab={insight.tab}
                    loadTranslation={(s: string) => fetchEnglishToChineseTranslation(s.slice(0, 4000))}
                    loadGrammar={(s: string) => fetchReadingGrammarNotes(s)}
                    onClose={() => setInsight(null)}
                />
            ) : null}

            {detailModalWordId ? (() => {
                const w = savedWordsList.find((x) => x.id === detailModalWordId);
                if (!w) return null;
                return <WordDetailModal word={w} isOpen={true} onClose={() => setDetailModalWordId(null)} />;
            })() : null}

            <ReadingWordCardModal
                isOpen={!!wordCardWord}
                onClose={() => setWordCardWord(null)}
                word={wordCardWord ?? ''}
                contextSnippet={wordCardWord ? extractContextSnippet(displayBody.replace(/\s+/g, ' '), wordCardWord) : ''}
                articleContextLabel={articleContextLabel}
                onAddToWordBank={handleWordCardAdd}
            />

            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" />
                    返回列表
                </Button>
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                    {DIFF_LABELS[article.difficulty] ?? article.difficulty}
                </span>
                <div className="ml-auto">
                    {article.addedToLibrary === false ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 border-teal-200 text-teal-800 hover:bg-teal-50"
                            onClick={() => {
                                setAddedToLibrary(article.id, true);
                                toast('已加入我的书库', 'success');
                            }}
                        >
                            <BookmarkPlus className="h-3.5 w-3.5" />
                            加入书库
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-9 gap-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            onClick={() => {
                                setAddedToLibrary(article.id, false);
                                toast('已移出我的书库', 'default');
                            }}
                        >
                            <BookmarkCheck className="h-3.5 w-3.5 text-teal-600" />
                            已在书库
                        </Button>
                    )}
                </div>
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-slate-800">{article.sourceTitle}</h1>

            {article.summary ? (
                <div className="rounded-xl border border-teal-100/80 bg-teal-50/50 p-3 text-sm leading-relaxed text-teal-900">
                    <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                        <Sparkles className="h-3 w-3" />
                        一句话摘要
                    </span>
                    {article.summary}
                </div>
            ) : null}

            {article.canonicalUrl ? (
                <a
                    href={article.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-teal-700 underline-offset-2 hover:underline"
                >
                    原文出处
                </a>
            ) : null}

            <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                    难度
                    <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                        value={article.difficulty}
                        onChange={(e) => updateDifficulty(article.id, Number(e.target.value) as RA['difficulty'])}
                    >
                        {([1, 2, 3, 4, 5] as const).map((d) => (
                            <option key={d} value={d}>
                                {DIFF_LABELS[d]}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <p className="text-xs text-slate-500">{progressLabel}</p>

            <div
                className={cn(
                    'grid gap-6',
                    hasSidebar ? 'lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start' : ''
                )}
            >
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center gap-1 border-b border-slate-100/90 bg-white/95 py-2 backdrop-blur-sm">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1"
                            disabled={transLoading}
                            onClick={() => void handleTranslateFull()}
                        >
                            {transLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Languages className="h-3.5 w-3.5" />
                            )}
                            翻译全文
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={articleTts.isPlaying ? 'default' : 'outline'}
                            className="h-9 gap-1"
                            onClick={articleTts.toggle}
                            aria-label={articleTts.isPlaying ? '停止朗读' : '朗读全文'}
                        >
                            {articleTts.isPlaying ? (
                                <Square className="h-3.5 w-3.5" />
                            ) : (
                                <Volume2 className="h-3.5 w-3.5" />
                            )}
                            {articleTts.isPlaying ? '停止朗读' : '朗读全文'}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1 text-slate-600 hover:text-slate-900"
                            onClick={() => {
                                const next = !showSavedHl;
                                setShowSavedHl(next);
                                writeSavedHlPref(next);
                            }}
                            title={showSavedHl ? '已标注生词本里的词；点击隐藏' : '已隐藏；点击显示生词本里的词'}
                        >
                            {showSavedHl ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            {showSavedHl ? '隐藏已学词' : '显示已学词'}
                        </Button>
                    </div>

                    {fullZhOpen && fullZh ? (
                        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-700">
                            <p className="mb-1 text-xs font-semibold text-slate-500">全文译文（节选上限内）</p>
                            <p className="whitespace-pre-wrap leading-relaxed">{fullZh}</p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-9"
                                onClick={() => setFullZhOpen(false)}
                            >
                                隐藏
                            </Button>
                        </div>
                    ) : null}

                    <div
                        ref={scrollRef}
                        className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm select-text"
                    >
                        {(phrasesList.length > 0 || keyWordsList.length > 0 || (showSavedHl && savedWordSet.size > 0)) && (
                            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-400">图例</span>
                                {phrasesList.length > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                        <span className="inline-block h-3 w-4 rounded-sm bg-yellow-200/80" aria-hidden />
                                        关键短语
                                    </span>
                                )}
                                {keyWordsList.length > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                        <span
                                            className="inline-block h-3 w-4 rounded-sm bg-teal-50"
                                            style={{ borderBottom: '2px dashed rgb(20 184 166)' }}
                                            aria-hidden
                                        />
                                        AI 精选生词
                                    </span>
                                )}
                                {showSavedHl && savedWordSet.size > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                        <span
                                            className="inline-block h-3 w-4 rounded-sm bg-slate-100"
                                            style={{ borderBottom: '2px dotted rgb(148 163 184)' }}
                                            aria-hidden
                                        />
                                        已收藏（点击查看卡片）
                                    </span>
                                )}
                            </div>
                        )}
                        <div
                            className={cn(
                                'prose prose-slate max-w-none',
                                'prose-headings:scroll-mt-4 prose-headings:font-semibold prose-headings:text-slate-800',
                                'prose-p:text-[15px] prose-p:leading-[1.8] prose-p:text-slate-800 prose-p:break-words',
                                'prose-li:my-0.5 prose-li:marker:text-slate-400',
                                'prose-blockquote:border-teal-200 prose-blockquote:text-slate-600',
                                'prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:text-slate-800 prose-code:before:content-none prose-code:after:content-none',
                                'prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:text-slate-100',
                                'prose-hr:border-slate-200',
                                'prose-table:text-sm'
                            )}
                        >
                            {summaryMode ? (
                                <div className="not-prose rounded-xl border border-amber-200/90 bg-amber-50/95 p-4 shadow-sm">
                                    <p className="text-sm font-semibold text-amber-950">核心摘要</p>
                                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-amber-950/95">
                                        {displayBody}
                                    </p>
                                    {article.canonicalUrl ? (
                                        <a
                                            href={article.canonicalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-md transition hover:bg-teal-700"
                                        >
                                            原文有付费墙限制，已为您提取核心摘要。想看全文请点此去官网。
                                        </a>
                                    ) : null}
                                </div>
                            ) : displayBody.trim() ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={readingMarkdownComponents}
                                >
                                    {displayBody}
                                </ReactMarkdown>
                            ) : (
                                <p className="text-[15px] text-slate-500">暂无正文</p>
                            )}
                        </div>
                    </div>
                </div>

                {hasSidebar ? (
                    <aside className="flex flex-col gap-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1">
                        {article.keyVocabulary && article.keyVocabulary.length > 0 ? (
                            <ReadingVocabCards items={article.keyVocabulary} />
                        ) : null}
                        {article.quiz && article.quiz.length > 0 ? (
                            <ReadingQuiz items={article.quiz} />
                        ) : null}
                    </aside>
                ) : null}
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
                翻译与语法分析由服务端 AI 代理提供，无需额外配置。朗读使用浏览器语音合成，文本在本地处理。
            </p>
        </div>
    );
}
