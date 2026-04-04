import { DashboardTodaysMood } from '@/components/dashboard/dashboard-todays-mood';
import { DashboardVibeSpotlight } from '@/components/dashboard/dashboard-vibe-spotlight';
import { StatCards } from '@/components/dashboard/stat-cards';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { DashboardRecentWords } from '@/components/dashboard/dashboard-recent-words';
import { DashboardDailyLoop } from '@/components/dashboard/dashboard-daily-loop';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { Page } from '@/App';

export function DashboardPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
    const [nickname] = useLocalStorage('lingovibe_display_name', '');
    const displayName = nickname.trim() || '语言学习者';

    return (
        <div className="relative min-w-0 pb-20 pt-1 sm:pt-3">
            <div
                className="pointer-events-none absolute inset-0 -z-10 min-h-full rounded-[2rem] opacity-[0.98]"
                style={{
                    background:
                        'linear-gradient(152deg, #f7f1e8 0%, #e9f3ef 36%, #dfece8 68%, #faf7f2 100%)',
                }}
            />
            <div className="pointer-events-none absolute -left-24 top-24 -z-10 h-72 w-72 rounded-full bg-teal-200/25 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 bottom-40 -z-10 h-80 w-80 rounded-full bg-amber-100/35 blur-3xl" />

            <div className="relative mx-auto flex max-w-6xl flex-col gap-14 px-4 sm:px-6 lg:gap-16 lg:px-10">
                <DashboardTodaysMood />
                <DashboardVibeSpotlight displayName={displayName} onNavigate={onNavigate} />

                <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-12 lg:items-start">
                    <div className="flex flex-col gap-12 lg:col-span-7 xl:col-span-8">
                        <StatCards layout="bento" />
                        <DashboardDailyLoop onNavigate={onNavigate} />
                    </div>
                    <div className="flex flex-col gap-12 lg:col-span-5 xl:col-span-4">
                        <DashboardQuickActions onNavigate={onNavigate} />
                        <DashboardRecentWords onNavigate={onNavigate} />
                    </div>
                </div>
            </div>
        </div>
    );
}
