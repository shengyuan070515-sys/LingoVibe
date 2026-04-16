import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home, BookMarked, Sparkles, BookOpen, MoreHorizontal,
    Image as ImageIcon, BarChart3, Trophy, Settings as SettingsIcon, GraduationCap, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mainTabs: { path: string; label: string; icon: typeof Home }[] = [
    { path: '/', label: '首页', icon: Home },
    { path: '/wordbank', label: '生词本', icon: BookMarked },
    { path: '/chat', label: 'AI', icon: Sparkles },
    { path: '/reading', label: '阅读', icon: BookOpen },
];

const moreTabs: { path: string; label: string; icon: typeof Home }[] = [
    { path: '/visual-dictionary', label: '视觉查词', icon: ImageIcon },
    { path: '/stats', label: '学习统计', icon: BarChart3 },
    { path: '/achievements', label: '学习成就', icon: Trophy },
    { path: '/courses', label: '微课', icon: GraduationCap },
    { path: '/settings', label: '设置', icon: SettingsIcon },
];

export function MobileTabBar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [moreOpen, setMoreOpen] = useState(false);

    const isMoreActive = moreTabs.some((t) => location.pathname === t.path);

    return (
        <>
            {moreOpen && (
                <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMoreOpen(false)}>
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                    <nav
                        className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="更多功能"
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">更多功能</span>
                            <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="关闭">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {moreTabs.map(({ path, label, icon: Icon }) => (
                                <button
                                    key={path}
                                    type="button"
                                    onClick={() => { navigate(path); setMoreOpen(false); }}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors',
                                        location.pathname === path ? 'bg-teal-50 text-teal-600' : 'text-slate-500 active:bg-slate-50'
                                    )}
                                >
                                    <Icon className="h-6 w-6" />
                                    <span className="text-[11px] font-medium leading-none">{label}</span>
                                </button>
                            ))}
                        </div>
                    </nav>
                </div>
            )}

            <nav
                className="fixed bottom-0 left-0 right-0 z-40 border-t border-teal-100/80 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-8px_30px_-12px_rgba(15,118,110,0.12)] backdrop-blur-md md:hidden"
                aria-label="主导航"
            >
                <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
                    {mainTabs.map(({ path, label, icon: Icon }) => {
                        const active =
                            location.pathname === path ||
                            (path === '/' && location.pathname === '/flashcard');
                        return (
                            <button
                                key={path}
                                type="button"
                                onClick={() => navigate(path)}
                                className={cn(
                                    'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
                                    active ? 'text-teal-600' : 'text-slate-400 active:bg-slate-50'
                                )}
                            >
                                <Icon className={cn('h-6 w-6 shrink-0', active ? 'stroke-[2]' : 'stroke-[1.5]')} aria-hidden />
                                <span className={cn('text-[10px] font-medium leading-none', active && 'font-semibold')}>{label}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        className={cn(
                            'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
                            isMoreActive ? 'text-teal-600' : 'text-slate-400 active:bg-slate-50'
                        )}
                    >
                        <MoreHorizontal className={cn('h-6 w-6 shrink-0', isMoreActive ? 'stroke-[2]' : 'stroke-[1.5]')} aria-hidden />
                        <span className={cn('text-[10px] font-medium leading-none', isMoreActive && 'font-semibold')}>更多</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
