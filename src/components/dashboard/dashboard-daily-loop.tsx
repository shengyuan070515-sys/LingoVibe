import { useNavigate } from 'react-router-dom';
import * as React from 'react';
import { CheckCircle2, Circle, ChevronRight, Layers, Bot, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWordBankStore } from '@/store/wordBankStore';
import { useDailyLoopStore, syncDailyLoopDate } from '@/store/dailyLoopStore';
import { selectDueWords } from '@/lib/srs-utils';

/** 纪要 C1/G1/G2：今日闭环三项 + 与活跃度并行展示 */
export function DashboardDailyLoop() {
    const navigate = useNavigate();
    const words = useWordBankStore((s) => s.words);
    const reviewQueueDone = useDailyLoopStore((s) => s.reviewQueueDone);
    const chatRoundDone = useDailyLoopStore((s) => s.chatRoundDone);
    const readingDone = useDailyLoopStore((s) => s.readingDone);

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);

    const dueCount = React.useMemo(() => selectDueWords(words).length, [words]);
    const allDone = reviewQueueDone && chatRoundDone && readingDone;

    const rows: {
        key: string;
        label: string;
        sub: string;
        done: boolean;
        icon: typeof Layers;
        page: Page;
    }[] = [
        {
            key: 'rev',
            label: '完成当日复习队列',
            sub: dueCount > 0 ? `待复习 ${dueCount} 词` : '当前无到期词',
            done: reviewQueueDone,
            icon: Layers,
            page: 'flashcard-review',
        },
        {
            key: 'chat',
            label: '完成 1 轮 AI 对话',
            sub: '发出一条消息并收到 Emma 回复（需 API Key）',
            done: chatRoundDone,
            icon: Bot,
            page: 'ai-chat',
        },
        {
            key: 'read',
            label: '完成每日阅读浏览',
            sub: '在每日阅读中打开任意一篇并读至文末、满足停留时间',
            done: readingDone,
            icon: BookOpen,
            page: 'daily-reading',
        },
    ];

    return (
        <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">今日闭环</h2>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-slate-700">三件事 · 约 15 分钟</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">与首页活跃度并行统计</p>
                </div>
                {allDone ? (
                    <span className="rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-500/20 backdrop-blur-sm">
                        今日三项已完成
                    </span>
                ) : null}
            </div>
            <div className="grid gap-3">
                {rows.map((r) => (
                    <button
                        key={r.key}
                        type="button"
                        onClick={() => { const paths: Record<string, string> = {"dashboard": "/", "daily-reading": "/reading", "wordbank": "/wordbank", "visual-dictionary": "/visual-dictionary", "ai-chat": "/chat", "flashcard-review": "/flashcard", "settings": "/settings"}; navigate(paths[r.page] ?? '/'); }}
                        className={cn(
                            'flex w-full items-center gap-3 rounded-3xl bg-white/50 p-4 text-left shadow-[0_6px_28px_-10px_rgba(15,23,42,0.1)] ring-1 ring-white/85 backdrop-blur-md transition',
                            'hover:bg-white/65 hover:shadow-md',
                            r.done ? 'ring-teal-200/50' : ''
                        )}
                    >
                        <div
                            className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                                r.done ? 'bg-teal-50 text-teal-600' : 'bg-slate-50 text-slate-500'
                            )}
                        >
                            <r.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-700">{r.label}</p>
                            <p className="text-xs leading-relaxed text-slate-600">{r.sub}</p>
                        </div>
                        {r.done ? (
                            <CheckCircle2 className="h-6 w-6 shrink-0 text-teal-500" aria-label="已完成" />
                        ) : (
                            <Circle className="h-6 w-6 shrink-0 text-slate-300" aria-label="未完成" />
                        )}
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </button>
                ))}
            </div>
        </section>
    );
}
