import * as React from 'react';
import { createPortal } from 'react-dom';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookMarked, Languages, Loader2, Volume2, ClipboardList, Sparkles } from 'lucide-react';
import { useLocalStorage } from '@/hooks/use-local-storage';
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
import { useReadingLibraryStore, type ReadingArticle as RA } from '@/store/readingLibraryStore';
import { useWordBankStore } from '@/store/wordBankStore';
import { recordReadingSession } from '@/store/learningAnalyticsStore';
import { syncDailyLoopDate, useDailyLoopStore } from '@/store/dailyLoopStore';

const DIFF_LABELS: Record<number, string> = {
    1: '入门',
    2: '基础',
    3: '中级',
    4: '进阶',
    5: '高阶',
};

const READING_MARKDOWN_COMPONENTS: Components = {
    a({ node: _n, children, className, href, ...rest }) {
        return (
            <a
                {...rest}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(className, 'break-words text-teal-700 underline-offset-2 hover:underline')}
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
                className={cn(className, 'max-h-[min(50vh,420px)] w-auto max-w-full rounded-lg shadow-sm')}
            />
        );
    },
};

function speakEnglish(text: string) {
    const t = text.trim();
    if (!t || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const v =
        voices.find((x) => x.lang === 'en-US' && (x.name.includes('Google') || x.name.includes('Microsoft'))) ||
        voices.find((x) => x.lang.startsWith('en'));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
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
      }
    | null;

export function ReadingArticleView({
    articleId,
    onBack,
    onNavigateToSettings,
}: {
    articleId: string;
    onBack: () => void;
    onNavigateToSettings?: () => void;
}) {
    const article = useReadingLibraryStore((s) => s.getById(articleId));
    const updateDifficulty = useReadingLibraryStore((s) => s.updateDifficulty);
    const addWord = useWordBankStore((s) => s.addWord);
    const [readingKey] = useLocalStorage('reading_api_key', '');
    const { toast } = useToast();
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const [fullZh, setFullZh] = React.useState<string | null>(null);
    const [fullZhOpen, setFullZhOpen] = React.useState(false);
    const [selZh, setSelZh] = React.useState<string | null>(null);
    const [selZhOpen, setSelZhOpen] = React.useState(false);
    const [grammar, setGrammar] = React.useState<string | null>(null);
    const [grammarLoading, setGrammarLoading] = React.useState(false);
    const [transLoading, setTransLoading] = React.useState(false);

    const [bubble, setBubble] = React.useState<SelBubble>(null);
    const [wordCardWord, setWordCardWord] = React.useState<string | null>(null);

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
        });
    }, [toast]);

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
        const onScroll = () => setBubble(null);
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
        if (!readingKey.trim()) {
            toast('请先在设置中填写每日阅读 DeepSeek Key', 'error');
            return;
        }
        setTransLoading(true);
        try {
            const chunk = displayBody.slice(0, 12000);
            const zh = await fetchEnglishToChineseTranslation(readingKey.trim(), chunk);
            setFullZh(zh || '（无译文）');
            setFullZhOpen(true);
        } catch (e) {
            toast(e instanceof Error ? e.message : '翻译失败', 'error');
        } finally {
            setTransLoading(false);
        }
    };

    const handleSentenceTranslate = async (sel: string) => {
        if (!readingKey.trim()) {
            toast('请先在设置中填写每日阅读 DeepSeek Key', 'error');
            return;
        }
        setBubble(null);
        setTransLoading(true);
        try {
            const zh = await fetchEnglishToChineseTranslation(readingKey.trim(), sel.slice(0, 4000));
            setSelZh(zh || '（无译文）');
            setSelZhOpen(true);
        } catch (e) {
            toast(e instanceof Error ? e.message : '翻译失败', 'error');
        } finally {
            setTransLoading(false);
        }
    };

    const handleGrammar = async (sel: string) => {
        if (!readingKey.trim()) {
            toast('请先在设置中填写每日阅读 DeepSeek Key', 'error');
            return;
        }
        setBubble(null);
        setGrammarLoading(true);
        setGrammar(null);
        try {
            const g = await fetchReadingGrammarNotes(readingKey.trim(), sel);
            setGrammar(g);
        } catch (e) {
            toast(e instanceof Error ? e.message : '分析失败', 'error');
        } finally {
            setGrammarLoading(false);
        }
    };

    const openWordCard = (sel: string) => {
        const w = soleEnglishTokenFromSelection(sel);
        if (!w) return;
        setBubble(null);
        setWordCardWord(w);
    };

    const addWordFromBubble = async (sel: string) => {
        const w = soleEnglishTokenFromSelection(sel);
        if (!w || !readingKey.trim()) {
            toast('请先在设置中填写每日阅读 DeepSeek Key', 'error');
            return;
        }
        setBubble(null);
        let card = wordCardCache.current.get(w.toLowerCase());
        if (!card) {
            try {
                const snip = extractContextSnippet(displayBody.replace(/\s+/g, ' '), sel.slice(0, 120));
                card = await fetchReadingWordCard(readingKey.trim(), w, snip);
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
                            className="h-8 flex-1 text-xs"
                            onClick={() => openWordCard(bubble.text)}
                        >
                            <Sparkles className="mr-1 h-3 w-3" />
                            翻译
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 flex-1 text-xs"
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
                            className="h-8 flex-1 text-xs"
                            disabled={transLoading}
                            onClick={() => void handleSentenceTranslate(bubble.text)}
                        >
                            <Languages className="mr-1 h-3 w-3" />
                            翻译（中文）
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 flex-1 text-xs"
                            disabled={grammarLoading}
                            onClick={() => void handleGrammar(bubble.text)}
                        >
                            {grammarLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            语法分析
                        </Button>
                    </>
                )}
            </div>,
            document.body
        );

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {bubblePortal}

            <ReadingWordCardModal
                isOpen={!!wordCardWord}
                onClose={() => setWordCardWord(null)}
                word={wordCardWord ?? ''}
                apiKey={readingKey}
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
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-slate-800">{article.sourceTitle}</h1>

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

            <div className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center gap-1 border-b border-slate-100/90 bg-white/95 py-2 backdrop-blur-sm">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    disabled={transLoading}
                    onClick={() => void handleTranslateFull()}
                >
                    {transLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                    翻译全文
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => speakEnglish(displayBody)}>
                    <Volume2 className="h-3.5 w-3.5" />
                    朗读全文
                </Button>
            </div>

            {fullZhOpen && fullZh ? (
                <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-700">
                    <p className="mb-1 text-xs font-semibold text-slate-500">全文译文（节选上限内）</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{fullZh}</p>
                    <Button type="button" variant="ghost" size="sm" className="mt-2 h-8" onClick={() => setFullZhOpen(false)}>
                        隐藏
                    </Button>
                </div>
            ) : null}

            {selZhOpen && selZh ? (
                <div className="rounded-xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-700">
                    <p className="mb-1 text-xs font-semibold text-slate-500">选区译文（仅中文）</p>
                    <p className="leading-relaxed">{selZh}</p>
                    <Button type="button" variant="ghost" size="sm" className="mt-2 h-8" onClick={() => setSelZhOpen(false)}>
                        隐藏
                    </Button>
                </div>
            ) : null}

            {grammar ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950">
                    <p className="mb-1 text-xs font-semibold">语法要点</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{grammar}</p>
                </div>
            ) : null}

            <div
                ref={scrollRef}
                className={cn(
                    'max-h-[min(70vh,520px)] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm',
                    'select-text'
                )}
            >
                <div
                    className={cn(
                        'prose prose-slate max-w-none',
                        'prose-headings:scroll-mt-4 prose-headings:font-semibold prose-headings:text-slate-800',
                        'prose-p:text-[15px] prose-p:leading-[1.75] prose-p:text-slate-800 prose-p:break-words',
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
                            <p className="text-[13px] font-semibold text-amber-950">核心摘要</p>
                            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-amber-950/95">{displayBody}</p>
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={READING_MARKDOWN_COMPONENTS}>
                            {displayBody}
                        </ReactMarkdown>
                    ) : (
                        <p className="text-[15px] text-slate-500">暂无正文</p>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-center text-sm text-slate-500">
                <ClipboardList className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="font-medium text-slate-600">随文测验</p>
                <p className="mt-1 text-xs">即将推出 · 规格已预留（≥5 题、80% 正确率）</p>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
                翻译与语法使用你在「设置」中的每日阅读 DeepSeek Key。联网搜索由 Serverless 使用 Tavily（环境变量
                TAVILY_API_KEY），不在浏览器暴露。朗读使用浏览器语音合成，文本在本地处理。
            </p>

            {!readingKey.trim() && onNavigateToSettings ? (
                <Button type="button" variant="outline" className="w-fit" onClick={onNavigateToSettings}>
                    去设置填写阅读 Key
                </Button>
            ) : null}
        </div>
    );
}
