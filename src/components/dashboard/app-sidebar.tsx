import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home,
    BookOpen,
    GraduationCap,
    Trophy,
    BarChart3,
    Bot,
    Book,
    Image as ImageIcon,
    Layers,
    Globe,
    HelpCircle,
} from 'lucide-react';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const menuItems: { path: string; icon: React.ElementType; label: string }[] = [
    { path: '/', icon: Home, label: '首页' },
    { path: '/courses', icon: GraduationCap, label: '学习路径' },
    { path: '/wordbank', icon: Book, label: '生词本' },
    { path: '/flashcard', icon: Layers, label: '闪卡复习' },
    { path: '/stats', icon: BarChart3, label: '学习统计' },
    { path: '/chat', icon: Bot, label: 'AI 对话' },
    { path: '/visual-dictionary', icon: ImageIcon, label: '视觉查词' },
    { path: '/reading', icon: BookOpen, label: '每日阅读' },
    { path: '/achievements', icon: Trophy, label: '成就与奖励' },
];

export function AppSidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isMobile, setOpen } = useSidebar();

    const go = (path: string) => {
        navigate(path);
        if (isMobile) setOpen(false);
    };

    return (
        <Sidebar
            className={cn(
                'border-slate-200/15 bg-[#f0f3ff] backdrop-blur-none dark:border-slate-800/15 dark:bg-slate-900',
                'md:border-r md:bg-[#f0f3ff]'
            )}
        >
            <SidebarHeader className="mb-2 border-0 px-6 pt-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stitch-primary text-white">
                        <Globe className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div>
                        <div className="font-headline text-xl font-extrabold tracking-tight text-blue-700 dark:text-blue-400">LingoVibe</div>
                        <div className="text-xs font-medium text-stitch-on-surface-variant opacity-80">学英语，有感觉</div>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent className="space-y-1 px-2">
                <SidebarMenu className="space-y-1">
                    {menuItems.map((item) => (
                        <SidebarMenuItem key={item.path}>
                            <SidebarMenuButton
                                active={location.pathname === item.path}
                                onClick={() => go(item.path)}
                            >
                                <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                                <span>{item.label}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="mt-auto space-y-1 border-slate-200/15 px-2 pt-2">
                <button
                    type="button"
                    onClick={() => go('/reading')}
                    className="mb-4 w-full rounded-xl bg-stitch-primary py-3 text-sm font-bold text-white shadow-md transition-transform active:scale-[0.98]"
                >
                    开始今日学习
                </button>
                <SidebarMenu className="space-y-1">
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            className="font-medium text-slate-600 hover:text-stitch-primary"
                            active={location.pathname === '/settings'}
                            onClick={() => go('/settings')}
                        >
                            <HelpCircle className="h-4 w-4 shrink-0" />
                            <span>帮助与设置</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
