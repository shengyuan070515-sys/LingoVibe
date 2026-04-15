import * as React from 'react';
import {
    ChevronLeft,
    ChevronRight,
    RotateCcw,
    Volume2,
    Frown,
    Meh,
    Smile,
    Settings,
    X,
    Image as ImageIcon,
    CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWordBankStore, type WordBankItem } from '@/store/wordBankStore';
import { selectDueWords } from '@/lib/srs-utils';
import { useDailyLoopStore, syncDailyLoopDate } from '@/store/dailyLoopStore';
import { useToast } from '@/components/ui/toast';
import { useReviewLogStore } from '@/store/reviewLogStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { todayKey, toLocalDateKey } from '@/lib/learning-analytics';
import type { Page } from '@/App';
import { speakEnglish } from '@/lib/speak-english';

interface FlashcardReviewPageProps {
    onNavigate: (page: Page) => void;
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ExampleWithHighlight({ sentence, word }: { sentence: string; word: string }) {
    if (!sentence.trim()) {
        return (
            <p className="text-lg italic leading-relaxed text-stitch-on-surface-variant/80">暂无例句</p>
        );
    }
    if (!word.trim()) {
        return <p className="text-lg italic leading-relaxed text-stitch-on-surface/80">{sentence}</p>;
    }
    const parts = sentence.split(new RegExp(`(${escapeRegExp(word)})`, 'gi'));
    return (
        <p className="text-lg italic leading-relaxed text-stitch-on-surface/80">
            {parts.map((part, i) =>
                part.toLowerCase() === word.toLowerCase() ? (
                    <span key={i} className="font-semibold text-stitch-primary not-italic">
                        {part}
                    </span>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </p>
    );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 纪要 D1a/D3a/H1：仅单词闪卡，纯本地，不依赖 API */
export function FlashcardReviewPage({ onNavigate }: FlashcardReviewPageProps) {
    const words = useWordBankStore((s) => s.words);
    const applySrsReviewOutcome = useWordBankStore((s) => s.applySrsReviewOutcome);
    const markReviewQueueDone = useDailyLoopStore((s) => s.markReviewQueueDone);
    const reviewEntries = useReviewLogStore((s) => s.entries);
    const lifetime = useLearningAnalyticsStore((s) => s.lifetime);
    const { toast } = useToast();

    const [queueIds, setQueueIds] = React.useState<string[]>([]);
    const [cursor, setCursor] = React.useState(0);
    const snapshotDone = React.useRef(false);
    const completionNotified = React.useRef(false);

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);

    React.useEffect(() => {
        const takeSnapshot = () => {
            if (snapshotDone.current) return;
            snapshotDone.current = true;
            const due = selectDueWords(useWordBankStore.getState().words);
            setQueueIds(due.map((w) => w.id));
            if (due.length === 0) {
                markReviewQueueDone();
            }
        };

        if (useWordBankStore.persist.hasHydrated()) {
            takeSnapshot();
            return;
        }
        return useWordBankStore.persist.onFinishHydration(() => takeSnapshot());
    }, [markReviewQueueDone]);

    const byId = React.useMemo(() => {
        const m = new Map<string, WordBankItem>();
        for (const w of words) m.set(w.id, w);
        return m;
    }, [words]);

    const currentId = queueIds[cursor] ?? null;
    const current = currentId ? byId.get(currentId) : undefined;
    const totalWords = queueIds.length;
    const currentIndex = cursor;
    const doneSession = snapshotDone.current && totalWords > 0 && cursor >= totalWords;

    React.useEffect(() => {
        if (!currentId || current) return;
        setCursor((c) => c + 1);
    }, [currentId, current]);

    React.useEffect(() => {
        if (!doneSession || completionNotified.current) return;
        completionNotified.current = true;
        markReviewQueueDone();
        toast('今日复习队列已完成 ✨', 'success');
    }, [doneSession, markReviewQueueDone, toast]);

    const goNext = React.useCallback(() => {
        setCursor((c) => c + 1);
    }, []);

    /** 0 = 不熟，1 = 学习中，2 = 掌握 — 对接 applySrsReviewOutcome */
    const onReviewResult = React.useCallback(
        (grade: 0 | 1 | 2) => {
            if (!currentId || !current) return;
            const outcome = grade === 0 ? 'forgot' : grade === 2 ? 'know' : 'learning';
            applySrsReviewOutcome(currentId, outcome);
            goNext();
        },
        [currentId, current, applySrsReviewOutcome, goNext]
    );

    const playWord = (text: string) => {
        void speakEnglish(text);
    };

    const progressRatio =
        totalWords > 0 ? Math.min(100, Math.round(((currentIndex + 1) / totalWords) * 100)) : 0;

    const todayKeyStr = todayKey();
    const weekAgo = Date.now() - 7 * DAY_MS;

    const masteredTodayCount = React.useMemo(
        () =>
            reviewEntries.filter(
                (e) => e.outcome === 'know' && toLocalDateKey(e.at) === todayKeyStr
            ).length,
        [reviewEntries, todayKeyStr]
    );

    const weeklyMasteredUnique = React.useMemo(() => {
        const seen = new Set<string>();
        for (const e of reviewEntries) {
            if (e.outcome !== 'know' || e.at < weekAgo) continue;
            seen.add(e.wordId);
        }
        return seen.size;
    }, [reviewEntries, weekAgo]);

    const recentlyMastered = React.useMemo(() => {
        const out: { wordId: string; word: string; subtitle: string }[] = [];
        const seen = new Set<string>();
        const sorted = [...reviewEntries].sort((a, b) => b.at - a.at);
        for (const e of sorted) {
            if (e.outcome !== 'know' || seen.has(e.wordId)) continue;
            seen.add(e.wordId);
            const live = byId.get(e.wordId);
            out.push({
                wordId: e.wordId,
                word: e.word,
                subtitle: live?.translation?.trim() || '—',
            });
            if (out.length >= 6) break;
        }
        return out;
    }, [reviewEntries, byId]);

    const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const el = e.currentTarget;
        el.onerror = null;
        el.src =
            'https://images.unsplash.com/photo-1518623489648-a173ef7824f3?auto=format&fit=crop&w=1200&q=80';
        el.className = `${el.className} opacity-60 grayscale`;
    };

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-3 pb-28 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8">
            <div className="mb-6 flex w-full max-w-5xl items-center justify-between gap-4">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1 px-2 text-stitch-on-surface-variant hover:text-stitch-on-surface"
                    onClick={() => onNavigate('dashboard')}
                >
                    <ChevronLeft className="h-4 w-4" />
                    首页
                </Button>
                <div className="hidden min-w-0 flex-1 px-4 sm:block">
                    <div className="mx-auto w-full max-w-md">
                        <div className="mb-1 flex items-end justify-between gap-2">
                            <span className="text-sm font-semibold text-stitch-on-surface-variant">
                                Daily Vocabulary Session
                            </span>
                            <span className="text-sm font-bold text-stitch-primary">
                                {totalWords > 0 ? `${currentIndex + 1} / ${totalWords}` : '—'}
                            </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-stitch-surface-container-high">
                            <div
                                className="h-full rounded-full bg-stitch-primary shadow-[0_0_8px_rgba(0,74,198,0.3)] transition-[width] duration-300"
                                style={{
                                    width: totalWords > 0 ? `${progressRatio}%` : '0%',
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={() => onNavigate('settings')}
                        className="rounded-xl bg-stitch-surface-container-low p-3 text-stitch-on-surface-variant transition-colors hover:bg-stitch-surface-container-high"
                        aria-label="设置"
                    >
                        <Settings className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onNavigate('dashboard')}
                        className="rounded-xl bg-stitch-surface-container-low p-3 text-stitch-on-surface-variant transition-colors hover:bg-stitch-surface-container-high"
                        aria-label="关闭"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* 移动端进度条 */}
            <div className="mb-8 w-full max-w-md sm:hidden">
                <div className="mb-1 flex items-end justify-between gap-2">
                    <span className="text-xs font-semibold text-stitch-on-surface-variant">
                        复习进度
                    </span>
                    <span className="text-xs font-bold text-stitch-primary">
                        {totalWords > 0 ? `${currentIndex + 1} / ${totalWords}` : '—'}
                    </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stitch-surface-container-high">
                    <div
                        className="h-full rounded-full bg-stitch-primary transition-[width] duration-300"
                        style={{ width: totalWords > 0 ? `${progressRatio}%` : '0%' }}
                    />
                </div>
            </div>

            {!snapshotDone.current && queueIds.length === 0 && (
                <p className="text-center text-sm text-stitch-on-surface-variant">正在加载生词本…</p>
            )}

            {snapshotDone.current && totalWords === 0 && (
                <div className="w-full max-w-lg rounded-[2rem] border border-stitch-outline/15 bg-stitch-surface-container-low p-10 text-center shadow-sm">
                    <p className="font-headline text-lg font-bold text-stitch-on-surface">
                        当前没有到期的单词
                    </p>
                    <p className="mt-2 text-sm text-stitch-on-surface-variant">
                        今日复习任务已记为完成。
                    </p>
                    <Button
                        type="button"
                        className="mt-6 rounded-xl bg-stitch-primary px-8 text-white hover:bg-[#2563eb]"
                        onClick={() => onNavigate('dashboard')}
                    >
                        回首页
                    </Button>
                </div>
            )}

            {snapshotDone.current && totalWords > 0 && currentIndex < totalWords && current && (
                <section className="grid w-full max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-12">
                    <div className="flex flex-col items-center lg:col-span-8">
                        <div className="flex w-full min-h-[min(520px,70vh)] flex-col overflow-hidden rounded-[2.5rem] bg-stitch-surface-container-lowest shadow-[0_20px_50px_rgba(21,28,39,0.04)] md:flex-row">
                            <div className="relative h-64 shrink-0 overflow-hidden md:h-auto md:w-5/12">
                                {current.images?.[0] ? (
                                    <img
                                        src={current.images[0]}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        onError={onImgError}
                                    />
                                ) : (
                                    <div className="flex h-full min-h-[16rem] w-full items-center justify-center bg-gradient-to-br from-stitch-surface-container-high to-stitch-surface-container-low">
                                        <ImageIcon className="h-16 w-16 text-stitch-outline/35" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                                <div className="absolute bottom-6 left-6 text-white">
                                    <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md">
                                        Concept Visualization
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col justify-center p-8 md:w-7/12 md:p-10">
                                <div className="mb-8 md:mb-10">
                                    <h2 className="font-headline mb-3 text-4xl font-extrabold tracking-tight text-stitch-on-surface sm:text-5xl md:text-6xl">
                                        {current.word}
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-3">
                                        {current.phonetic ? (
                                            <span className="font-body text-lg font-medium italic text-[#2563eb]">
                                                {current.phonetic}
                                            </span>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => playWord(current.word)}
                                            className="flex h-10 w-10 items-center justify-center rounded-full bg-stitch-primary/10 text-stitch-primary transition-colors hover:bg-stitch-primary/20"
                                            aria-label="朗读"
                                        >
                                            <Volume2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-stitch-on-surface-variant">
                                            Definition
                                        </p>
                                        <p className="text-lg leading-relaxed text-stitch-on-surface sm:text-xl">
                                            {current.translation?.trim() || '（暂无释义）'}
                                        </p>
                                    </div>
                                    <div className="border-t border-[#c3c6d7]/15 pt-6">
                                        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-stitch-on-surface-variant">
                                            Usage
                                        </p>
                                        <ExampleWithHighlight
                                            sentence={current.exampleSentence || ''}
                                            word={current.word}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:gap-6">
                            <button
                                type="button"
                                onClick={() => onReviewResult(0)}
                                className="group flex flex-1 flex-col items-center gap-1 rounded-2xl bg-stitch-surface-container-high py-5 font-bold text-stitch-on-surface transition-all hover:-translate-y-1 active:scale-95"
                            >
                                <Frown className="h-7 w-7 text-[#ba1a1a]" strokeWidth={2} />
                                <span>Unfamiliar</span>
                                <span className="text-[10px] font-normal text-stitch-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
                                    重新学习
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onReviewResult(1)}
                                className="group flex flex-1 flex-col items-center gap-1 rounded-2xl bg-stitch-surface-container-high py-5 font-bold text-stitch-on-surface transition-all hover:-translate-y-1 active:scale-95"
                            >
                                <Meh className="h-7 w-7 text-stitch-tertiary" strokeWidth={2} />
                                <span>Learning</span>
                                <span className="text-[10px] font-normal text-stitch-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
                                    次日再练
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onReviewResult(2)}
                                className="group flex flex-1 flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-stitch-secondary to-stitch-secondary-container py-5 font-bold text-white shadow-lg shadow-stitch-secondary/20 transition-all hover:-translate-y-1 active:scale-95"
                            >
                                <Smile className="h-7 w-7" strokeWidth={2} />
                                <span>Know</span>
                                <span className="text-[10px] font-normal text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
                                    掌握
                                </span>
                            </button>
                        </div>
                    </div>

                    <aside className="w-full space-y-6 lg:col-span-4">
                        <div className="rounded-[2rem] bg-stitch-surface-container-low p-6 sm:p-8">
                            <div className="mb-6 flex items-center justify-between gap-2 sm:mb-8">
                                <h3 className="font-headline text-lg font-bold text-stitch-on-surface">
                                    Recently Mastered
                                </h3>
                                <span className="rounded-full bg-stitch-secondary-container px-2 py-1 text-[10px] font-bold text-stitch-on-secondary-container">
                                    +{masteredTodayCount} Today
                                </span>
                            </div>
                            <div className="space-y-4">
                                {recentlyMastered.length === 0 ? (
                                    <p className="text-sm text-stitch-on-surface-variant">
                                        还没有「掌握」记录，完成几张闪卡后会出现在这里。
                                    </p>
                                ) : (
                                    recentlyMastered.map((row) => (
                                        <div
                                            key={row.wordId}
                                            className="group flex items-center gap-4 rounded-2xl bg-stitch-surface-container-lowest p-4 transition-shadow hover:shadow-sm sm:p-5"
                                        >
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stitch-secondary/10 text-stitch-secondary">
                                                <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-stitch-on-surface">{row.word}</h4>
                                                <p className="truncate text-xs text-stitch-on-surface-variant">
                                                    {row.subtitle}
                                                </p>
                                            </div>
                                            <ChevronRight className="h-5 w-5 shrink-0 text-[#c3c6d7] opacity-0 transition-opacity group-hover:opacity-100" />
                                        </div>
                                    ))
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => onNavigate('wordbank')}
                                className="mt-6 w-full py-3 text-sm font-bold text-stitch-primary hover:underline"
                            >
                                View Library
                            </button>
                        </div>

                        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-stitch-primary to-[#2563eb] p-6 text-white shadow-xl sm:p-8">
                            <div className="absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                            <div className="relative z-10">
                                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-white/70">
                                    Weekly Goal
                                </p>
                                <h4 className="font-headline mb-4 text-3xl font-extrabold">
                                    {weeklyMasteredUnique} Words
                                </h4>
                                <p className="mb-6 text-xs font-medium text-white/80">
                                    近 7 日标记为「掌握」的不同词条数 · 累计复习{' '}
                                    <span className="font-bold">{lifetime.srsReviews}</span> 次
                                </p>
                                <button
                                    type="button"
                                    onClick={() => toast('排行榜功能即将上线', 'default')}
                                    className="w-full rounded-xl bg-white py-3 text-sm font-bold text-stitch-primary shadow-xl transition-transform active:scale-95"
                                >
                                    View Leaderboard
                                </button>
                            </div>
                        </div>
                    </aside>
                </section>
            )}

            {snapshotDone.current && totalWords > 0 && currentIndex >= totalWords && (
                <div className="w-full max-w-lg rounded-[2rem] border border-stitch-secondary-container/40 bg-stitch-secondary-container/25 p-10 text-center">
                    <RotateCcw className="mx-auto mb-3 h-10 w-10 text-stitch-secondary" />
                    <p className="font-headline text-lg font-bold text-stitch-on-surface">
                        本轮已过完 {totalWords} 张卡
                    </p>
                    <Button
                        type="button"
                        className="mt-6 rounded-xl bg-stitch-secondary px-8 text-white hover:bg-stitch-on-secondary-container"
                        onClick={() => onNavigate('dashboard')}
                    >
                        回首页
                    </Button>
                </div>
            )}
        </div>
    );
}
