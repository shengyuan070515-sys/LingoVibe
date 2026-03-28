import * as React from 'react';
import { WelcomeHeader } from '@/components/dashboard/welcome-header';
import { StatCards } from '@/components/dashboard/stat-cards';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { DashboardRecentWords } from '@/components/dashboard/dashboard-recent-words';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useWordBankStore } from '@/store/wordBankStore';
import { useLearningAnalyticsStore } from '@/store/learningAnalyticsStore';
import { computeLearningStreak, todayKey } from '@/lib/learning-analytics';
import type { Page } from '@/App';

export function DashboardPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
    const [nickname] = useLocalStorage('lingovibe_display_name', '');
    const words = useWordBankStore((s) => s.words);
    const dailyActivity = useLearningAnalyticsStore((s) => s.dailyActivity);
    const lifetime = useLearningAnalyticsStore((s) => s.lifetime);

    const streak = React.useMemo(() => computeLearningStreak(dailyActivity), [dailyActivity]);
    const displayName = nickname.trim() || '语言学习者';
    const avatarUrl = `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=e0f2fe`;

    const wordCount = words.filter((w) => w && w.word?.trim()).length;
    const today = todayKey();
    const todayScore = dailyActivity[today] ?? 0;
    const todayActivityHint =
        todayScore > 0
            ? `今日活跃度 ${todayScore} · 累计对话 ${lifetime.chatMessages} 次 · 视觉查词 ${lifetime.visualLookups} 次`
            : '今天还没有活跃度记录，去对话或查词开启第一条吧。';

    return (
        <div className="relative min-w-0 pb-8">
            <div
                className="pointer-events-none absolute inset-0 -z-10 rounded-3xl opacity-90"
                style={{
                    background:
                        'linear-gradient(165deg, rgba(224,242,254,0.65) 0%, rgba(255,255,255,0.4) 42%, rgba(253,230,224,0.35) 100%)',
                }}
            />
            <div className="relative mx-auto flex max-w-5xl flex-col gap-10 px-0 pt-1 sm:pt-2">
                <WelcomeHeader
                    userName={displayName}
                    avatarUrl={avatarUrl}
                    streakDays={streak}
                    wordCount={wordCount}
                    todayActivityHint={todayActivityHint}
                />
                <StatCards />
                <DashboardQuickActions onNavigate={onNavigate} />
                <DashboardRecentWords onNavigate={onNavigate} />
            </div>
        </div>
    );
}
