import { useNavigate, useLocation } from 'react-router-dom';
import { Home, BookMarked, Sparkles, Image as ImageIcon, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs: { path: string; label: string; icon: typeof Home }[] = [
    { path: '/', label: '首页', icon: Home },
    { path: '/wordbank', label: '生词本', icon: BookMarked },
    { path: '/chat', label: 'AI', icon: Sparkles },
    { path: '/visual-dictionary', label: '查词', icon: ImageIcon },
    { path: '/reading', label: '阅读', icon: BookOpen },
];

/** 手机底栏：参照「图标 + 短标签 + 选中青绿色」的阅读类 App 习惯 */
export function MobileTabBar() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-teal-100/80 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-8px_30px_-12px_rgba(15,118,110,0.12)] backdrop-blur-md md:hidden"
            aria-label="主导航"
        >
            <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
                {tabs.map(({ path, label, icon: Icon }) => {
                    /** 闪卡复习归在「首页」闭环下，避免底栏无选中态 */
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
                                active
                                    ? 'text-teal-600'
                                    : 'text-slate-400 active:bg-slate-50'
                            )}
                        >
                            <Icon
                                className={cn('h-6 w-6 shrink-0', active ? 'stroke-[2]' : 'stroke-[1.5]')}
                                aria-hidden
                            />
                            <span className={cn('text-[10px] font-medium leading-none', active && 'font-semibold')}>
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
