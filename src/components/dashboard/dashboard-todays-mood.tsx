import * as React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useWordBankStore } from '@/store/wordBankStore';
import { fetchTodaysMoodGreeting } from '@/lib/ai-chat';
import { todayKey } from '@/lib/learning-analytics';
import { cn } from '@/lib/utils';

function fallbackLine(word: string): string {
    const w = word.trim() || 'this word';
    return `You're building something real — "${w}" is proof you're showing up. Keep going.`;
}

export function DashboardTodaysMood({ className }: { className?: string }) {
    const words = useWordBankStore((s) => s.words);

    const latestWord = React.useMemo(() => {
        const list = (words || []).filter((w) => w?.type === 'word' && w.word?.trim());
        if (list.length === 0) return null;
        return [...list].sort((a, b) => b.addedAt - a.addedAt)[0]!;
    }, [words]);

    const [line, setLine] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState(false);

    React.useEffect(() => {
        if (!latestWord) {
            setLine('');
            setErr(false);
            return;
        }
        const cacheKey = `lingovibe_mood_line_${todayKey()}_${latestWord.word.trim().toLowerCase()}`;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                setLine(cached);
                setErr(false);
                return;
            }
        } catch {
            /* ignore */
        }

        let cancelled = false;
        setLoading(true);
        setErr(false);
        fetchTodaysMoodGreeting('', latestWord.word)
            .then((t) => {
                if (cancelled) return;
                const clean = t.trim() || fallbackLine(latestWord.word);
                setLine(clean);
                try {
                    localStorage.setItem(cacheKey, clean);
                } catch {
                    /* ignore */
                }
            })
            .catch(() => {
                if (cancelled) return;
                setErr(true);
                setLine(fallbackLine(latestWord.word));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [latestWord]);

    return (
        <section
            className={cn(
                'rounded-[1.75rem] bg-white/45 p-8 shadow-[0_8px_40px_-12px_rgba(15,118,110,0.12)] ring-1 ring-white/70 backdrop-blur-xl sm:p-10',
                className
            )}
        >
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-teal-600/80" strokeWidth={2} />
                Today&apos;s Mood
            </div>
            {!latestWord ? (
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                    收录第一个单词后，这里会出现基于你最近收藏词的英文心情句。先去视觉查词或 AI 对话里存一个词吧。
                </p>
            ) : (
                <>
                    <p className="mt-3 text-sm text-slate-600">
                        从你最近收录的单词出发
                        <span className="mx-1 font-semibold text-slate-700">「{latestWord.word}」</span>
                        — Emma 风格鼓励语
                    </p>
                    <div className="relative mt-5 min-h-[3rem]">
                        {loading ? (
                            <div className="flex items-center gap-2 text-slate-500">
                                <Loader2 className="h-5 w-5 animate-spin text-teal-600/70" />
                                <span className="text-sm">正在生成一句英文问候…</span>
                            </div>
                        ) : (
                            <p
                                className={cn(
                                    'text-lg font-medium leading-relaxed tracking-tight text-slate-700 sm:text-xl',
                                    err && 'text-slate-600'
                                )}
                            >
                                {line || fallbackLine(latestWord.word)}
                            </p>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
