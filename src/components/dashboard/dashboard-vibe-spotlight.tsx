import { useNavigate } from 'react-router-dom';
import * as React from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReadingLibraryStore } from '@/store/readingLibraryStore';
import { Button } from '@/components/ui/button';

export function DashboardVibeSpotlight({
    displayName,
    className,
}: {
    displayName: string;
    className?: string;
}) {
    const navigate = useNavigate();
    const articles = useReadingLibraryStore((s) => s.articles);
    const featured = React.useMemo(() => {
        if (!articles?.length) return null;
        const i = new Date().getDate() % articles.length;
        return articles[i]!;
    }, [articles]);

    const preview = featured?.content?.slice(0, 280).trim() ?? '';

    if (!featured) {
        return (
            <section
                className={cn(
                    'rounded-[1.75rem] bg-white/40 p-8 shadow-[0_8px_40px_-12px_rgba(14,116,144,0.1)] ring-1 ring-white/80 backdrop-blur-xl sm:p-10',
                    className
                )}
            >
                <p className="text-slate-600">
                    Hey {displayName}，书库还是空的。去「每日阅读」搜索或导入一篇文章，这里会轮播展示节选。
                </p>
                {(
                    <Button type="button" className="mt-4 rounded-full bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/reading')}>
                        打开每日阅读
                        <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                )}
            </section>
        );
    }

    return (
        <section
            className={cn(
                'overflow-hidden rounded-[1.75rem] shadow-[0_12px_48px_-14px_rgba(15,118,110,0.18)] ring-1 ring-white/75 backdrop-blur-xl',
                className
            )}
        >
            <div className="relative flex min-h-[200px] flex-col justify-end p-8 sm:p-10 lg:min-h-[220px]">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-teal-50/95 via-[#eef6f3]/90 to-[#f7f4ef]/95" />
                <div className="relative">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                        <BookOpen className="h-3.5 w-3.5 text-teal-600/80" />
                        今日阅读角
                    </div>
                    <p className="mt-4 text-[15px] leading-[1.75] text-slate-600 sm:text-base">
                        Hey {displayName}，今天翻翻这篇：「{featured.sourceTitle}」
                    </p>
                    {preview ? (
                        <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-slate-500">{preview}…</p>
                    )}
                    {(
                        <Button
                            type="button"
                            variant="secondary"
                            className="mt-6 rounded-full"
                            onClick={() => navigate('/reading')}
                        >
                            去每日阅读打开
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </section>
    );
}
