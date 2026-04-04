import { Bot, Image as ImageIcon, Book, BookOpen, ChevronRight, Layers } from 'lucide-react';
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
        id: 'flashcard-review',
        title: '闪卡复习',
        desc: '今日到期词 · 离线英中闪卡',
        icon: Layers,
        gradient: 'from-teal-50/90 via-white/55 to-cyan-50/75',
    },
    {
        id: 'daily-reading',
        title: '每日阅读',
        desc: '精读与拓展，列表与导入即将上线',
        icon: BookOpen,
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
        <section className="space-y-5">
            <div>
                <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">学习入口</h2>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-700">Bento 快捷方式</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">与本地数据同步 · 轻点即达</p>
            </div>
            <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4">
                {actions.map((a, idx) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => onNavigate(a.id)}
                        className={cn(
                            'group flex min-h-[5.5rem] flex-col justify-between rounded-3xl bg-gradient-to-br p-4 text-left shadow-[0_6px_28px_-8px_rgba(15,23,42,0.12)] ring-1 ring-white/85 backdrop-blur-md transition duration-200',
                            'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-900/5 sm:min-h-[6.25rem] sm:p-5',
                            idx === 0 ? 'col-span-2 sm:min-h-[7rem]' : '',
                            a.gradient
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-slate-600 shadow-sm ring-1 ring-white/90 transition duration-200 group-hover:scale-[1.05]">
                                <a.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                            </div>
                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-800">{a.title}</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{a.desc}</p>
                        </div>
                    </button>
                ))}
            </div>
            <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="flex w-full items-center justify-center gap-2 rounded-3xl bg-white/40 py-3.5 text-sm text-slate-600 shadow-sm ring-1 ring-white/80 backdrop-blur-md transition hover:bg-white/60 hover:text-slate-700"
            >
                <BookOpen className="h-4 w-4 opacity-70" />
                我的课程（示例进度）
            </button>
        </section>
    );
}
