import * as React from 'react';
import {
    Home,
    BookOpen,
    GraduationCap,
    LogOut,
    Trophy,
    MessageSquare,
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
import { Page } from '@/App';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
    activePage: Page;
    setActivePage: (page: Page) => void;
}

export function AppSidebar({ activePage, setActivePage }: AppSidebarProps) {
    const { isMobile, setOpen } = useSidebar();

    const navigate = (id: Page) => {
        setActivePage(id);
        if (isMobile) setOpen(false);
    };

    const menuItems: { id: Page; icon: React.ElementType; label: string }[] = [
        { id: 'dashboard', icon: Home, label: '首页' },
        { id: 'courses', icon: GraduationCap, label: '学习路径' },
        { id: 'wordbank', icon: Book, label: '生词本' },
        { id: 'flashcard-review', icon: Layers, label: '闪卡复习' },
        { id: 'stats', icon: BarChart3, label: '学习统计' },
        { id: 'ai-chat', icon: Bot, label: 'AI 对话' },
        { id: 'visual-dictionary', icon: ImageIcon, label: '视觉查词' },
        { id: 'daily-reading', icon: BookOpen, label: '每日阅读' },
        { id: 'achievements', icon: Trophy, label: '成就与奖励' },
        { id: 'community', icon: MessageSquare, label: '社区交流' },
    ];

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
                        <div className="text-xs font-medium text-stitch-on-surface-variant opacity-80">Premium Learner</div>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent className="space-y-1 px-2">
                <SidebarMenu className="space-y-1">
                    {menuItems.map((item) => (
                        <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton active={activePage === item.id} onClick={() => navigate(item.id)}>
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
                    onClick={() => navigate('daily-reading')}
                    className="mb-4 w-full rounded-xl bg-stitch-primary py-3 text-sm font-bold text-white shadow-md transition-transform active:scale-[0.98]"
                >
                    开始今日学习
                </button>
                <SidebarMenu className="space-y-1">
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            className="font-medium text-slate-600 hover:text-stitch-primary"
                            active={activePage === 'settings'}
                            onClick={() => navigate('settings')}
                        >
                            <HelpCircle className="h-4 w-4 shrink-0" />
                            <span>帮助与设置</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton className="font-medium text-red-500 hover:bg-red-50 hover:text-red-600">
                            <LogOut className="h-4 w-4 shrink-0" />
                            <span>退出登录</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
