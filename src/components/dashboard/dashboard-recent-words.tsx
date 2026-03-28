import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { useWordBankStore } from '@/store/wordBankStore';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';

export function DashboardRecentWords({ onNavigate }: { onNavigate: (p: Page) => void }) {
    const words = useWordBankStore((s) => s.words);
    const recent = React.useMemo(() => {
        return [...words]
            .filter((w) => w && typeof w.word === 'string' && w.word.trim())
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, 5);
    }, [words]);

    if (recent.length === 0) {
        return (
            <section className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-50/70 via-white/80 to-cyan-50/40 p-6 text-center shadow-sm">
                <Sparkles className="mx-auto h-9 w-9 text-sky-400" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium text-slate-700">生词本里还没有词条</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    在「视觉查词」「AI 对话」或「播客」里收录单词后，会出现在这里
                </p>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-4 rounded-full bg-white/90 text-sky-700 shadow-sm hover:bg-white"
                    onClick={() => onNavigate('visual-dictionary')}
                >
                    去视觉查词
                </Button>
            </section>
        );
    }

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-700">最近收录</h2>
                <button
                    type="button"
                    onClick={() => onNavigate('wordbank')}
                    className="text-sm font-medium text-sky-600 transition hover:text-sky-800"
                >
                    打开生词本
                </button>
            </div>
            <ul className="space-y-2">
                {recent.map((w) => (
                    <li
                        key={w.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white/75 px-4 py-3 shadow-sm ring-1 ring-slate-100/90 backdrop-blur-sm"
                    >
                        <span className="shrink-0 font-semibold text-slate-800">{w.word}</span>
                        <span className="min-w-0 truncate text-right text-xs text-slate-500">
                            {w.translation && w.translation !== '翻译加载中...' ? w.translation : '释义加载中…'}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
