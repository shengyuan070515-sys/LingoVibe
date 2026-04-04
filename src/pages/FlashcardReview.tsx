import * as React from 'react';
import { ChevronLeft, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWordBankStore, type WordBankItem } from '@/store/wordBankStore';
import { selectDueWords } from '@/lib/srs-utils';
import { useDailyLoopStore, syncDailyLoopDate } from '@/store/dailyLoopStore';
import { useToast } from '@/components/ui/toast';
import type { Page } from '@/App';

interface FlashcardReviewPageProps {
    onNavigate: (page: Page) => void;
}

/** 纪要 D1a/D3a/H1：仅单词闪卡，纯本地，不依赖 API */
export function FlashcardReviewPage({ onNavigate }: FlashcardReviewPageProps) {
    const words = useWordBankStore((s) => s.words);
    const applySrsReviewOutcome = useWordBankStore((s) => s.applySrsReviewOutcome);
    const markReviewQueueDone = useDailyLoopStore((s) => s.markReviewQueueDone);
    const { toast } = useToast();

    const [queueIds, setQueueIds] = React.useState<string[]>([]);
    const [cursor, setCursor] = React.useState(0);
    const [showZh, setShowZh] = React.useState(false);
    const snapshotDone = React.useRef(false);
    const completionNotified = React.useRef(false);

    React.useEffect(() => {
        syncDailyLoopDate();
    }, []);

    React.useEffect(() => {
        const takeSnapshot = () => {
            if (snapshotDone.current) return;
            snapshotDone.current = true;
            const due = selectDueWords(useWordBankStore.getState().words);
            setQueueIds(due.map((w) => w.id));
            if (due.length === 0) {
                markReviewQueueDone();
            }
        };

        if (useWordBankStore.persist.hasHydrated()) {
            takeSnapshot();
            return;
        }
        return useWordBankStore.persist.onFinishHydration(() => takeSnapshot());
    }, [markReviewQueueDone]);

    const byId = React.useMemo(() => {
        const m = new Map<string, WordBankItem>();
        for (const w of words) m.set(w.id, w);
        return m;
    }, [words]);

    const currentId = queueIds[cursor] ?? null;
    const current = currentId ? byId.get(currentId) : undefined;
    const total = queueIds.length;
    const doneSession = snapshotDone.current && total > 0 && cursor >= total;

    React.useEffect(() => {
        if (!currentId || current) return;
        setShowZh(false);
        setCursor((c) => c + 1);
    }, [currentId, current]);

    React.useEffect(() => {
        if (!doneSession || completionNotified.current) return;
        completionNotified.current = true;
        markReviewQueueDone();
        toast('今日复习队列已完成 ✨', 'success');
    }, [doneSession, markReviewQueueDone, toast]);

    const goNext = React.useCallback(() => {
        setShowZh(false);
        setCursor((c) => c + 1);
    }, []);

    const onKnow = () => {
        if (!currentId || !current) return;
        applySrsReviewOutcome(currentId, 'know');
        goNext();
    };

    const onForgot = () => {
        if (!currentId || !current) return;
        applySrsReviewOutcome(currentId, 'forgot');
        goNext();
    };

    const playWord = (text: string) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
    };

    return (
        <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col gap-4 px-1 pb-8 pt-2">
            <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 px-2" onClick={() => onNavigate('dashboard')}>
                    <ChevronLeft className="h-4 w-4" />
                    首页
                </Button>
                <h1 className="text-lg font-semibold text-slate-800">闪卡复习</h1>
            </div>
            <p className="text-sm text-slate-500">英↔中自评，离线可用。间隔：会 → 1 / 3 / 7 天阶梯。</p>

            {!snapshotDone.current && queueIds.length === 0 && (
                <p className="text-sm text-slate-400">正在加载生词本…</p>
            )}

            {snapshotDone.current && total === 0 && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-6 text-center">
                    <p className="text-slate-700">当前没有到期的单词。</p>
                    <p className="mt-2 text-sm text-slate-500">今日复习任务已记为完成。</p>
                    <Button type="button" className="mt-4" onClick={() => onNavigate('dashboard')}>
                        回首页
                    </Button>
                </div>
            )}

            {snapshotDone.current && total > 0 && cursor < total && current && (
                <>
                    <div className="text-center text-xs font-medium text-slate-400">
                        {cursor + 1} / {total}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowZh((s) => !s)}
                        className="min-h-[200px] w-full rounded-2xl border border-slate-200/90 bg-white p-6 text-left shadow-sm transition hover:border-teal-200"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-2xl font-bold tracking-tight text-slate-900">{current.word}</span>
                            <span className="flex items-center gap-1 text-xs text-teal-600">
                                {showZh ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                {showZh ? '隐藏释义' : '显示释义'}
                            </span>
                        </div>
                        {current.phonetic ? (
                            <p className="mt-2 font-mono text-sm text-slate-500">{current.phonetic}</p>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={(e) => {
                                e.stopPropagation();
                                playWord(current.word);
                            }}
                        >
                            朗读
                        </Button>
                        {showZh ? (
                            <p className="mt-4 text-base leading-relaxed text-slate-700">{current.translation || '（暂无释义）'}</p>
                        ) : (
                            <p className="mt-4 text-sm italic text-slate-400">点击卡片查看中文</p>
                        )}
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                        <Button type="button" variant="outline" className="h-12 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={onForgot}>
                            不会
                        </Button>
                        <Button type="button" className="h-12 bg-teal-600 hover:bg-teal-700" onClick={onKnow}>
                            会
                        </Button>
                    </div>
                </>
            )}

            {snapshotDone.current && total > 0 && cursor >= total && (
                <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-6 text-center">
                    <RotateCcw className="mx-auto mb-2 h-8 w-8 text-teal-600" />
                    <p className="font-medium text-slate-800">本轮已过完 {total} 张卡</p>
                    <Button type="button" className="mt-4" onClick={() => onNavigate('dashboard')}>
                        回首页
                    </Button>
                </div>
            )}
        </div>
    );
}
