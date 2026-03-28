import { Bot, Mic2, Image as ImageIcon, Book, BookOpen, ChevronRight } from 'lucide-react';
import type { Page } from '@/App';
import { cn } from '@/lib/utils';

const actions: {
    id: Page;
    title: string;
    desc: string;
    icon: typeof Bot;
    gradient: string;
}[] = [
    {
        id: 'ai-chat',
        title: 'AI 对话',
        desc: '和 Emma 练口语，划词加入生词本',
        icon: Bot,
        gradient: 'from-sky-100/90 via-white/60 to-indigo-50/80',
    },
    {
        id: 'daily-podcast',
        title: '每日播客',
        desc: '听读一体，点词或双击收录',
        icon: Mic2,
        gradient: 'from-amber-50/90 via-white/50 to-orange-50/75',
    },
    {
        id: 'visual-dictionary',
        title: '视觉查词',
        desc: '配图释义，一键加入生词本',
        icon: ImageIcon,
        gradient: 'from-emerald-50/90 via-white/50 to-teal-50/75',
    },
    {
        id: 'wordbank',
        title: '我的生词本',
        desc: '分页浏览、整理与复习',
        icon: Book,
        gradient: 'from-violet-50/90 via-white/50 to-fuchsia-50/70',
    },
];

export function DashboardQuickActions({ onNavigate }: { onNavigate: (p: Page) => void }) {
    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-700">今天从这里开始</h2>
                <p className="text-sm text-slate-500">入口与你在应用里的学习数据实时同步</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {actions.map((a) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => onNavigate(a.id)}
                        className={cn(
                            'group flex items-center gap-4 rounded-2xl border border-white/90 bg-gradient-to-br p-4 text-left shadow-sm',
                            'transition-all duration-200 hover:-translate-y-0.5 hover:border-white hover:shadow-md hover:shadow-slate-200/60',
                            a.gradient
                        )}
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/80 text-slate-600 shadow-sm ring-1 ring-white transition duration-200 group-hover:scale-[1.04]">
                            <a.icon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800">{a.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{a.desc}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
                    </button>
                ))}
            </div>
            <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200/90 bg-white/50 py-3.5 text-sm text-slate-500 backdrop-blur-sm transition hover:border-slate-300 hover:bg-white/80 hover:text-slate-700"
            >
                <BookOpen className="h-4 w-4 opacity-70" />
                我的课程（示例进度演示）
            </button>
        </section>
    );
}
