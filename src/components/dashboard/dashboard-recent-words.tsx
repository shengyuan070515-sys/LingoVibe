import { useNavigate } from 'react-router-dom';
import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { useWordBankStore } from '@/store/wordBankStore';
import { Button } from '@/components/ui/button';

export function DashboardRecentWords() {
    const navigate = useNavigate();
    const words = useWordBankStore((s) => s.words);
    const recent = React.useMemo(() => {
        return [...words]
            .filter((w) => w && typeof w.word === 'string' && w.word.trim())
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, 5);
    }, [words]);

    if (recent.length === 0) {
        return (
            <section className="rounded-[1.75rem] bg-white/45 p-8 text-center shadow-[0_8px_36px_-12px_rgba(14,116,144,0.12)] ring-1 ring-white/75 backdrop-blur-xl">
                <Sparkles className="mx-auto h-9 w-9 text-teal-500/80" strokeWidth={1.5} />
                <p className="mt-4 text-sm font-medium text-slate-700">生词本里还没有词条</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    在「视觉查词」「AI 对话」或「每日阅读」里收录单词后，会出现在这里
                </p>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-5 rounded-full border-0 bg-white/70 text-slate-700 shadow-sm ring-1 ring-white/90 backdrop-blur-sm hover:bg-white/90"
                    onClick={() => navigate('/visual-dictionary')}
                >
                    去视觉查词
                </Button>
            </section>
        );
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">词卡流</h2>
                    <p className="mt-0.5 text-lg font-semibold text-slate-700">最近收录</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/wordbank')}
                    className="text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-teal-700 hover:underline"
                >
                    生词本
                </button>
            </div>
            <ul className="space-y-2.5">
                {recent.map((w) => (
                    <li
                        key={w.id}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3.5 shadow-sm ring-1 ring-white/80 backdrop-blur-md"
                    >
                        <span className="shrink-0 font-semibold text-slate-700">{w.word}</span>
                        <span className="min-w-0 truncate text-right text-xs text-slate-600">
                            {w.translation && w.translation !== '翻译加载中...' ? w.translation : '释义加载中…'}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
