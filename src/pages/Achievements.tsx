import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWordBankStore } from '@/store/wordBankStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { computeLearningStreak } from '@/lib/learning-analytics';
import {
    BookMarked,
    Flame,
    MessageCircle,
    BookOpen,
    Search,
    Sparkles,
    Star,
    Trophy,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BadgeDef {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    unlocked: (ctx: {
        wordCount: number;
        streak: number;
        activeDays: number;
        life: { chatMessages: number; visualLookups: number; readingSessions: number; srsReviews: number };
    }) => boolean;
}

const BADGES: BadgeDef[] = [
    {
        id: 'first-word',
        title: '开卷有益',
        description: '生词本里有了第一条记录',
        icon: Star,
        unlocked: ({ wordCount }) => wordCount >= 1,
    },
    {
        id: 'words-10',
        title: '词海拾贝',
        description: '累计收录达到 10 条',
        icon: BookMarked,
        unlocked: ({ wordCount }) => wordCount >= 10,
    },
    {
        id: 'words-50',
        title: '词汇猎人',
        description: '累计收录达到 50 条',
        icon: Sparkles,
        unlocked: ({ wordCount }) => wordCount >= 50,
    },
    {
        id: 'streak-3',
        title: '三日小火苗',
        description: '连续 3 天有学习记录',
        icon: Flame,
        unlocked: ({ streak }) => streak >= 3,
    },
    {
        id: 'streak-7',
        title: '一周战士',
        description: '连续 7 天有学习记录',
        icon: Flame,
        unlocked: ({ streak }) => streak >= 7,
    },
    {
        id: 'active-14',
        title: '习惯养成中',
        description: '累计 14 个「活跃日」',
        icon: Trophy,
        unlocked: ({ activeDays }) => activeDays >= 14,
    },
    {
        id: 'chat-5',
        title: '话匣子',
        description: '在 AI 对话中发送 5 条英文消息',
        icon: MessageCircle,
        unlocked: ({ life }) => life.chatMessages >= 5,
    },
    {
        id: 'lookup-10',
        title: '视觉探索者',
        description: '完成 10 次视觉查词',
        icon: Search,
        unlocked: ({ life }) => life.visualLookups >= 10,
    },
    {
        id: 'reading-1',
        title: '声临其境',
        description: '完成 1 次每日阅读复习',
        icon: BookOpen,
        unlocked: ({ life }) => life.readingSessions >= 1,
    },
    {
        id: 'srs-20',
        title: '复习达人',
        description: '累计 20 次间隔复习记录',
        icon: BookMarked,
        unlocked: ({ life }) => life.srsReviews >= 20,
    },
];

export function AchievementsPage() {
    const words = useWordBankStore((s) => s.words);
    const dailyActivity = useLearningAnalyticsStore((s) => s.dailyActivity);
    const lifetime = useLearningAnalyticsStore((s) => s.lifetime);
    const backfillActivityFromWords = useLearningAnalyticsStore((s) => s.backfillActivityFromWords);

    React.useEffect(() => {
        backfillActivityFromWords(words.map((w) => ({ addedAt: w.addedAt })));
    }, [words, backfillActivityFromWords]);

    const streak = React.useMemo(() => computeLearningStreak(dailyActivity), [dailyActivity]);
    const activeDays = React.useMemo(
        () => Object.values(dailyActivity).filter((n) => n > 0).length,
        [dailyActivity]
    );

    const ctx = {
        wordCount: words.filter((w) => !w.id.startsWith('demo-')).length,
        streak,
        activeDays,
        life: lifetime,
    };

    const unlockedCount = BADGES.filter((b) => b.unlocked(ctx)).length;

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-0 sm:gap-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">学习成就</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    已解锁 <span className="font-semibold text-indigo-600">{unlockedCount}</span> / {BADGES.length}{' '}
                    枚勋章——继续用 LingoVibe，徽章会跟着亮起来。
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {BADGES.map((b) => {
                    const ok = b.unlocked(ctx);
                    const Icon = b.icon;
                    return (
                        <Card
                            key={b.id}
                            className={cn(
                                'overflow-hidden transition-shadow',
                                ok ? 'border-indigo-200 shadow-md ring-1 ring-indigo-100' : 'opacity-80'
                            )}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                                            ok ? 'bg-indigo-500 text-white' : 'bg-muted text-muted-foreground'
                                        )}
                                    >
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">{b.title}</CardTitle>
                                        <CardDescription className="mt-1">{b.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <p
                                    className={cn(
                                        'text-xs font-semibold',
                                        ok ? 'text-emerald-600' : 'text-muted-foreground'
                                    )}
                                >
                                    {ok ? '已解锁' : '未解锁 · 继续学习即可达成'}
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
