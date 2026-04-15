import * as React from 'react';
import {
    Check,
    ChevronRight,
    Flame,
    Headphones,
    BookOpen,
    PlayCircle,
    Trophy,
    Volume2,
    Crown,
    Zap,
} from 'lucide-react';
import { DashboardTodaysMood } from '@/components/dashboard/dashboard-todays-mood';
import { DashboardDailyLoop } from '@/components/dashboard/dashboard-daily-loop';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { Page } from '@/App';
import { useWordBankStore, type WordBankItem } from '@/store/wordBankStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { computeLearningStreak, todayKey, toLocalDateKey } from '@/lib/learning-analytics';
import { fetchFeaturedDaily, type FeaturedBundleItem } from '@/lib/reading-featured-api';
import { useReadingLibraryStore } from '@/store/readingLibraryStore';
import { selectDueWords } from '@/lib/srs-utils';
import { cn } from '@/lib/utils';
import { speakEnglish } from '@/lib/speak-english';

const READING_HERO =
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=1400&q=80&auto=format&fit=crop';

function initials(name: string): string {
    const s = name.trim();
    if (!s) return 'LV';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return s.slice(0, 2).toUpperCase();
}

function startOfWeekMonday(d = new Date()): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const dow = x.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    x.setDate(x.getDate() + offset);
    return x;
}

function addDays(d: Date, n: number): Date {
    const o = new Date(d);
    o.setDate(o.getDate() + n);
    return o;
}

function cefrFromWordLevel(level: number): string {
    if (level <= 1) return 'A1';
    if (level <= 3) return 'B1';
    if (level <= 5) return 'B2';
    return 'C1';
}

const WEEK_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function RecentWordCard({ w }: { w: WordBankItem }) {
    const gloss =
        w.translation && w.translation !== '翻译加载中...' ? w.translation : '释义加载中…';
    return (
        <div className="group rounded-xl border border-transparent bg-stitch-surface-container-lowest p-6 shadow-stitch-soft transition-colors hover:border-stitch-primary/10">
            <div className="mb-4 flex items-start justify-between">
                <span className="rounded bg-stitch-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stitch-on-secondary-container">
                    Level {cefrFromWordLevel(w.level)}
                </span>
                <button
                    type="button"
                    aria-label={`朗读 ${w.word}`}
                    className="text-stitch-on-surface-variant transition-colors hover:text-stitch-primary"
                    onClick={() => void speakEnglish(w.word)}
                >
                    <Volume2 className="h-4 w-4" />
                </button>
            </div>
            <div className="mb-1 text-xl font-bold text-stitch-on-surface">{w.word}</div>
            <div className="mb-3 text-sm italic text-stitch-on-surface-variant">{w.pos || '—'}</div>
            <p className="line-clamp-2 text-sm text-stitch-on-surface-variant">{gloss}</p>
        </div>
    );
}

export function DashboardPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
    const [nickname] = useLocalStorage('lingovibe_display_name', '');
    const displayName = nickname.trim() || '语言学习者';

    const words = useWordBankStore((s) => s.words);
    const dailyActivity = useLearningAnalyticsStore((s) => s.dailyActivity);
    const backfillActivityFromWords = useLearningAnalyticsStore((s) => s.backfillActivityFromWords);
    const articles = useReadingLibraryStore((s) => s.articles);

    React.useEffect(() => {
        backfillActivityFromWords(words.map((w) => ({ addedAt: w.addedAt })));
    }, [words, backfillActivityFromWords]);

    const streak = React.useMemo(() => computeLearningStreak(dailyActivity), [dailyActivity]);
    const dailyTotal = 5;
    const todayScore = dailyActivity[todayKey()] ?? 0;
    const dailyCompleted = Math.min(dailyTotal, Math.floor(todayScore / 4));
    const goalPct = dailyCompleted / dailyTotal;

    const recentWords = React.useMemo(() => {
        return [...words]
            .filter((w) => w && typeof w.word === 'string' && w.word.trim() && w.type === 'word')
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, 4);
    }, [words]);

    const dueCount = React.useMemo(() => selectDueWords(words).length, [words]);

    const [featured, setFeatured] = React.useState<FeaturedBundleItem | null>(null);
    const [featuredLoading, setFeaturedLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        setFeaturedLoading(true);
        (async () => {
            try {
                const bundle = await fetchFeaturedDaily();
                if (!cancelled && bundle.items[0]) setFeatured(bundle.items[0]);
            } catch {
                if (!cancelled) setFeatured(null);
            } finally {
                if (!cancelled) setFeaturedLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const librarySpotlight = React.useMemo(() => {
        if (!articles?.length) return null;
        const i = new Date().getDate() % articles.length;
        return articles[i]!;
    }, [articles]);

    const readingCard = featured
        ? {
              title: featured.title,
              snippet: featured.snippet?.trim() || '今日精选外文摘要',
              tag: featured.categoryLabelZh || '每日精选',
          }
        : librarySpotlight
          ? {
                title: librarySpotlight.sourceTitle,
                snippet:
                    librarySpotlight.summaryText?.trim()?.slice(0, 200) ||
                    librarySpotlight.content.replace(/\s+/g, ' ').trim().slice(0, 200) ||
                    '打开每日阅读继续浏览书库文章。',
                tag: librarySpotlight.summaryOnly ? '摘要模式' : '我的书库',
            }
          : {
                title: '开始你的第一篇每日阅读',
                snippet: '联网搜索或导入文本，把外刊放进书库；完成后计入今日闭环与活跃度。',
                tag: '每日阅读',
            };

    const weekCells = React.useMemo(() => {
        const mon = startOfWeekMonday();
        const tkey = todayKey();
        return WEEK_SHORT.map((label, i) => {
            const d = addDays(mon, i);
            const key = toLocalDateKey(d.getTime());
            const score = dailyActivity[key] ?? 0;
            return { label, key, score, isToday: key === tkey };
        });
    }, [dailyActivity]);

    const r = 58;
    const c = 2 * Math.PI * r;
    const dashOffset = c * (1 - goalPct);

    return (
        <div className="relative min-w-0 pb-12 pt-1 font-sans sm:pt-2">
            <header className="mb-8 flex flex-col justify-between gap-4 sm:mb-10 sm:flex-row sm:items-center">
                <div>
                    <h1 className="font-headline text-2xl font-extrabold tracking-tight text-stitch-on-surface sm:text-3xl">
                        欢迎回来，{displayName}！
                    </h1>
                    <p className="mt-1 font-medium text-stitch-on-surface-variant">保持节奏，今天也进步一点点。</p>
                </div>
                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-2 rounded-full bg-stitch-tertiary-fixed px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-stitch-on-tertiary-fixed">
                        <Crown className="h-3.5 w-3.5" strokeWidth={2} />
                        VIP 会员
                    </div>
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white bg-stitch-surface-container-high text-sm font-bold text-stitch-on-surface shadow-sm"
                        aria-hidden
                    >
                        {initials(displayName)}
                    </div>
                </div>
            </header>

            <div className="mb-8 grid grid-cols-12 gap-6 lg:gap-8">
                <div className="col-span-12 flex items-center justify-between rounded-xl bg-stitch-surface-container-lowest p-6 shadow-stitch-card md:col-span-5 lg:p-8">
                    <div className="relative z-10 min-w-0">
                        <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-stitch-on-surface-variant">今日目标</h3>
                        <div className="space-y-1">
                            <div className="text-4xl font-black text-stitch-on-surface">
                                {dailyCompleted} / {dailyTotal}
                            </div>
                            <div className="text-sm font-medium text-stitch-on-surface-variant">活跃度格子（每 +4 点亮 1 格）</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onNavigate('daily-reading')}
                            className="mt-6 flex items-center gap-1 text-sm font-bold text-stitch-primary transition-all hover:gap-2"
                        >
                            去完成 <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden>
                            <circle className="text-stitch-surface-container-high" cx="64" cy="64" fill="transparent" r={r} stroke="currentColor" strokeWidth="10" />
                            <circle
                                className="text-stitch-secondary drop-shadow-[0_0_8px_rgba(0,108,74,0.25)]"
                                cx="64"
                                cy="64"
                                fill="transparent"
                                r={r}
                                stroke="currentColor"
                                strokeDasharray={c}
                                strokeDashoffset={dashOffset}
                                strokeLinecap="round"
                                strokeWidth="10"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-black text-stitch-secondary">{Math.round(goalPct * 100)}%</span>
                        </div>
                    </div>
                </div>

                <div className="col-span-12 flex flex-col justify-between rounded-xl border border-stitch-outline/15 bg-stitch-surface-container-low p-6 shadow-sm lg:col-span-7 lg:p-8">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="mb-1 text-sm font-bold uppercase tracking-widest text-stitch-on-surface-variant">连续学习</h3>
                            <div className="flex items-baseline gap-2 font-headline text-5xl font-black text-stitch-primary">
                                {streak} <span className="text-lg font-bold text-stitch-on-surface-variant">天</span>
                            </div>
                        </div>
                        <div className="rounded-2xl bg-stitch-primary-fixed p-4">
                            <Flame className="h-8 w-8 text-stitch-primary" strokeWidth={2} />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-between gap-1">
                        {weekCells.map((cell) => (
                            <div key={cell.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                <span
                                    className={cn(
                                        'text-[10px] font-bold uppercase text-stitch-on-surface-variant',
                                        cell.isToday && 'text-stitch-primary'
                                    )}
                                >
                                    {cell.label}
                                </span>
                                <div
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-full border border-stitch-outline/20',
                                        cell.score > 0 && 'border-0 bg-stitch-secondary text-white',
                                        cell.score === 0 && cell.isToday && 'bg-stitch-primary text-white ring-4 ring-stitch-primary/20',
                                        cell.score === 0 && !cell.isToday && 'bg-stitch-surface-container-highest opacity-40'
                                    )}
                                >
                                    {cell.score > 0 ? (
                                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                    ) : cell.isToday ? (
                                        <Zap className="h-3.5 w-3.5 fill-current" strokeWidth={2} />
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <section className="mb-12">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="font-headline text-2xl font-bold text-stitch-on-surface">最近学习</h2>
                    <button
                        type="button"
                        onClick={() => onNavigate('wordbank')}
                        className="text-sm font-bold text-stitch-primary hover:underline"
                    >
                        打开生词本
                    </button>
                </div>
                {recentWords.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stitch-outline/25 bg-stitch-surface-container-lowest/80 p-10 text-center shadow-stitch-soft">
                        <p className="font-medium text-stitch-on-surface">生词本里还没有单词</p>
                        <p className="mt-2 text-sm text-stitch-on-surface-variant">在视觉查词、AI 对话或每日阅读里收录后会出现在这里。</p>
                        <button
                            type="button"
                            onClick={() => onNavigate('visual-dictionary')}
                            className="mt-5 rounded-full bg-stitch-primary px-6 py-2 text-sm font-bold text-white shadow-md transition hover:opacity-95"
                        >
                            去视觉查词
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {recentWords.map((w) => (
                            <RecentWordCard key={w.id} w={w} />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="font-headline text-2xl font-bold text-stitch-on-surface">为你推荐</h2>
                </div>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <div className="group relative h-80 overflow-hidden rounded-2xl shadow-lg md:col-span-2">
                        <img
                            src={READING_HERO}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
                        <div className="absolute bottom-0 left-0 p-6 text-white sm:p-8">
                            <div className="mb-3 flex items-center gap-2">
                                <BookOpen className="h-4 w-4 opacity-90" />
                                <span className="text-xs font-bold uppercase tracking-widest opacity-90">
                                    {featuredLoading ? '加载中…' : `${readingCard.tag} · 精读推荐`}
                                </span>
                            </div>
                            <h3 className="mb-3 font-headline text-2xl font-bold leading-tight sm:text-3xl">{readingCard.title}</h3>
                            <p className="mb-4 line-clamp-2 text-sm leading-relaxed opacity-90">{readingCard.snippet}</p>
                            <button
                                type="button"
                                onClick={() => onNavigate('daily-reading')}
                                className="rounded-full border border-white/30 bg-white/20 px-6 py-2 text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white hover:text-stitch-on-surface"
                            >
                                去每日阅读
                            </button>
                        </div>
                    </div>

                    <div className="relative flex h-80 flex-col overflow-hidden rounded-2xl bg-stitch-tertiary p-8 text-white">
                        <div className="relative z-10">
                            <div className="mb-4 flex items-center gap-2">
                                <Headphones className="h-4 w-4 opacity-90" />
                                <span className="text-xs font-bold uppercase tracking-widest opacity-90">AI 对话 · 口语</span>
                            </div>
                            <h3 className="mb-4 font-headline text-2xl font-bold leading-tight">和 Emma 练地道表达</h3>
                            <p className="mb-8 line-clamp-3 text-sm opacity-90">
                                正式与闲聊模式可选，支持翻译与纠错标签；适合练反应与句型。
                            </p>
                            <button
                                type="button"
                                onClick={() => onNavigate('ai-chat')}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-stitch-tertiary transition-colors hover:bg-stitch-tertiary-fixed-dim"
                            >
                                <PlayCircle className="h-5 w-5 fill-current" />
                                开始对话
                            </button>
                        </div>
                        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-stitch-primary/25 blur-2xl" />
                    </div>

                    <div className="relative flex flex-col items-stretch justify-between gap-6 overflow-hidden rounded-2xl border border-stitch-secondary/10 bg-stitch-secondary-container p-8 text-stitch-on-secondary-container md:col-span-3 md:flex-row md:items-center">
                        <div className="relative z-10 max-w-xl">
                            <h3 className="mb-2 font-headline text-2xl font-black">闪卡复习挑战</h3>
                            <p className="mb-6 font-medium text-stitch-on-secondary-container/85">
                                {dueCount > 0
                                    ? `当前有 ${dueCount} 个单词待复习，完成一轮巩固记忆曲线。`
                                    : '暂无到期词，去生词本收录新词或稍后再来。'}
                            </p>
                            <div className="flex flex-wrap items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => onNavigate('flashcard-review')}
                                    className="rounded-full bg-stitch-secondary px-8 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-95"
                                >
                                    开始复习
                                </button>
                                <span className="text-xs font-bold opacity-70">SRS · 与今日闭环联动</span>
                            </div>
                        </div>
                        <div className="relative z-10 hidden pr-8 lg:block">
                            <Trophy className="h-[120px] w-[120px] rotate-12 opacity-20" strokeWidth={1} />
                        </div>
                    </div>
                </div>
            </section>

            <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-5">
                    <DashboardTodaysMood />
                </div>
                <div className="lg:col-span-7">
                    <DashboardDailyLoop onNavigate={onNavigate} />
                </div>
            </div>
        </div>
    );
}
