import { Target, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useWordBankStore } from '@/store/wordBankStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import * as React from 'react';
import { computeLearningStreak, todayKey, totalWeightedEntries } from '@/lib/learning-analytics';
import { cn } from '@/lib/utils';

export function StatCards({ layout = 'wide' }: { layout?: 'wide' | 'bento' }) {
    const words = useWordBankStore((s) => s.words);
    const dailyActivity = useLearningAnalyticsStore((s) => s.dailyActivity);
    const backfillActivityFromWords = useLearningAnalyticsStore((s) => s.backfillActivityFromWords);

    React.useEffect(() => {
        backfillActivityFromWords(words.map((w) => ({ addedAt: w.addedAt })));
    }, [words, backfillActivityFromWords]);

    const streak = React.useMemo(() => computeLearningStreak(dailyActivity), [dailyActivity]);
    const today = todayKey();
    const todayScore = dailyActivity[today] ?? 0;
    const dailyTotal = 5;
    const dailyCompleted = Math.min(dailyTotal, Math.floor(todayScore / 4));
    const goalProgress = (dailyCompleted / dailyTotal) * 100;

    const weighted = totalWeightedEntries(words);
    const estimatedLex = words.length === 0 ? 3000 : Math.min(5200, Math.round(3000 + 18 * weighted));

    const last7 = React.useMemo(() => {
        const out: number[] = [];
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(end);
            d.setDate(d.getDate() - i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const key = `${y}-${m}-${day}`;
            out.push(dailyActivity[key] ?? 0);
        }
        return out;
    }, [dailyActivity]);

    const max7 = Math.max(1, ...last7);

    const shell =
        'rounded-3xl border-0 bg-white/55 shadow-[0_6px_32px_-10px_rgba(15,23,42,0.08)] ring-1 ring-white/80 backdrop-blur-md transition duration-200 hover:bg-white/70 hover:shadow-md';

    const grid =
        layout === 'bento' ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4 md:grid-cols-2 lg:grid-cols-4';

    return (
        <div className={grid}>
            <Card className={cn(shell, 'bg-gradient-to-br from-sky-50/80 to-white/90')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600">今日目标</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100/90 text-sky-600">
                        <Target className="h-4 w-4" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-slate-800">
                        {dailyCompleted}/{dailyTotal}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        活跃度每 +4 点亮 1 格（查词、对话、收录、阅读等）
                    </p>
                    <Progress value={goalProgress} className="mt-3 h-2 bg-sky-100/80" />
                </CardContent>
            </Card>

            <Card className={cn(shell, 'bg-gradient-to-br from-amber-50/70 to-white/90')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600">连续学习</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100/90 text-amber-600">
                        <Zap className="h-4 w-4" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-slate-800">{streak} 天</div>
                    <p className="mt-1 text-xs text-slate-500">有学习行为的日子会延续连胜</p>
                    <div className="mt-3 flex gap-1">
                        {[...Array(7)].map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    'h-2 flex-1 rounded-full transition-colors',
                                    streak > 0 && i < Math.min(7, streak)
                                        ? 'bg-gradient-to-r from-amber-300 to-orange-300'
                                        : 'bg-slate-100'
                                )}
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className={cn(shell, 'bg-gradient-to-br from-emerald-50/70 to-white/90')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600">近 7 日活跃</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100/90 text-emerald-600">
                        <BarChart3 className="h-4 w-4" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex h-12 items-end gap-1">
                        {last7.map((v, i) => (
                            <div
                                key={i}
                                className="w-full rounded-t-md bg-gradient-to-t from-emerald-200/90 to-teal-300/80 transition-all"
                                style={{ height: `${Math.max(10, (v / max7) * 100)}%` }}
                                title={`${v} 活跃度`}
                            />
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">柱高表示当日总活跃度</p>
                </CardContent>
            </Card>

            <Card className={cn(shell, 'bg-gradient-to-br from-violet-50/70 to-white/90')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600">估算阅读词汇</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100/90 text-violet-600">
                        <TrendingUp className="h-4 w-4" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold tabular-nums text-slate-800">
                        {estimatedLex.toLocaleString()}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">基于收录 {words.length} 条的激励型估算</p>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="rounded-full bg-violet-100/90 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                            向 5000 进发
                        </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
