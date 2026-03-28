import * as React from 'react';
import { ActivityHeatmap } from '@/components/learning/ActivityHeatmap';
import { VocabularyGrowthChart } from '@/components/learning/VocabularyGrowthChart';
import { MasteryRadarChart } from '@/components/learning/MasteryRadarChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWordBankStore } from '@/store/wordBankStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { computeLearningStreak, computeRadarScores, totalWeightedEntries } from '@/lib/learning-analytics';
import { Flame, TrendingUp, Radar } from 'lucide-react';

export function LearningStatsPage() {
    const words = useWordBankStore((s) => s.words);
    const dailyActivity = useLearningAnalyticsStore((s) => s.dailyActivity);
    const lifetime = useLearningAnalyticsStore((s) => s.lifetime);
    const backfillActivityFromWords = useLearningAnalyticsStore((s) => s.backfillActivityFromWords);

    React.useEffect(() => {
        backfillActivityFromWords(words.map((w) => ({ addedAt: w.addedAt })));
    }, [words, backfillActivityFromWords]);

    const streak = React.useMemo(() => computeLearningStreak(dailyActivity), [dailyActivity]);
    const radar = React.useMemo(
        () => computeRadarScores(lifetime, words.filter((w) => w.type === 'word').length),
        [lifetime, words]
    );
    const weighted = React.useMemo(() => totalWeightedEntries(words), [words]);
    const latestEstimate =
        words.length === 0 ? 3000 : Math.min(5200, Math.round(3000 + 18 * weighted));

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-0 sm:gap-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">学习统计</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    用数据看见自己的坚持——热度、词汇曲线与四维能力画像（行为估算）。
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-l-4 border-l-orange-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Flame className="h-4 w-4 text-orange-500" />
                            连续学习
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{streak} 天</p>
                        <p className="mt-1 text-xs text-muted-foreground">今日有任意学习行为即延续 streak</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <TrendingUp className="h-4 w-4 text-indigo-500" />
                            估算阅读词汇量
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold tabular-nums">{latestEstimate.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-muted-foreground">基于收录词条粗略推算，非测试结果</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">本应用收录</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold tabular-nums">{words.length}</p>
                        <p className="mt-1 text-xs text-muted-foreground">单词 + 句子卡片合计</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>学习绿荫墙</CardTitle>
                    <CardDescription>类似 GitHub 贡献图：颜色越深，当天在 App 内学习行为越活跃。</CardDescription>
                </CardHeader>
                <CardContent>
                    <ActivityHeatmap dailyActivity={dailyActivity} weeks={14} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>词汇量增长曲线</CardTitle>
                    <CardDescription>
                        纵轴为「估算阅读词汇量」：以 3000 为基线，随你在本应用中的收录与积累向 5000+ 攀升（示意性激励曲线）。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <VocabularyGrowthChart words={words} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Radar className="h-5 w-5 text-indigo-500" />
                        单词掌握度雷达
                    </CardTitle>
                    <CardDescription>听、说、读、写 四个维度，根据使用习惯动态估算。</CardDescription>
                </CardHeader>
                <CardContent>
                    <MasteryRadarChart scores={radar} />
                </CardContent>
            </Card>
        </div>
    );
}
