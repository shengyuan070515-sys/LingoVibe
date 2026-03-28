import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface WelcomeHeaderProps {
    userName: string;
    avatarUrl?: string;
    streakDays: number;
    wordCount: number;
    todayActivityHint?: string;
}

export function WelcomeHeader({
    userName,
    avatarUrl,
    streakDays,
    wordCount,
    todayActivityHint,
}: WelcomeHeaderProps) {
    const hour = new Date().getHours();
    let greeting = '早安';
    if (hour >= 12 && hour < 18) greeting = '午安';
    if (hour >= 18) greeting = '晚安';

    return (
        <div
            className={cn(
                'overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br p-6 shadow-md shadow-sky-100/40 sm:p-8',
                'from-white/95 via-sky-50/50 to-emerald-50/40 backdrop-blur-md'
            )}
        >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4 sm:gap-5">
                    <Avatar className="h-[4.5rem] w-[4.5rem] border-[3px] border-white shadow-lg shadow-sky-200/50 sm:h-20 sm:w-20">
                        <AvatarImage src={avatarUrl} alt={userName} />
                        <AvatarFallback className="bg-gradient-to-br from-sky-400 to-teal-400 text-xl font-bold text-white">
                            {userName.charAt(0)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-600/80">LingoVibe</p>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
                            {greeting}，{userName}
                        </h1>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                            清新开场，慢慢来也可以。当前生词本共有{' '}
                            <span className="font-semibold text-teal-700">{wordCount}</span> 个词条。
                        </p>
                        {todayActivityHint ? (
                            <p className="mt-1 text-xs text-slate-500">{todayActivityHint}</p>
                        ) : null}
                    </div>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                    <div className="rounded-2xl bg-white/70 px-5 py-3 text-center shadow-sm ring-1 ring-sky-100/80 backdrop-blur-sm sm:text-right">
                        <p className="text-xs font-medium text-slate-500">连续有学习记录</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700/90">
                            {streakDays}
                            <span className="ml-1 text-base font-semibold text-slate-600">天</span>
                        </p>
                    </div>
                    <p className="text-center text-[11px] text-slate-400 sm:text-right">
                        来自你的活跃度与收录数据，非演示数字
                    </p>
                </div>
            </div>
        </div>
    );
}
