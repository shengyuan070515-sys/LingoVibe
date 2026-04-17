import * as React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type InsightTab = 'translate' | 'grammar';

export interface SelectionInsightPanelProps {
    open: boolean;
    /** The original selected sentence text. */
    sentence: string;
    /** Rect of the selection at open-time. On `md:` breakpoint, used to anchor the floating panel. */
    anchorRect: DOMRect | null;
    initialTab: InsightTab;
    /** Invoked on first entry to each tab (cached after that per sentence). */
    loadTranslation: (sentence: string) => Promise<string>;
    loadGrammar: (sentence: string) => Promise<string>;
    onClose: () => void;
}

function useMediaIsDesktop(): boolean {
    const [isDesktop, setIsDesktop] = React.useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    );
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 768px)');
        const onChange = () => setIsDesktop(mq.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return isDesktop;
}

interface CacheSlot {
    data?: string;
    error?: string;
    loading: boolean;
}

interface CacheEntry {
    translate?: CacheSlot;
    grammar?: CacheSlot;
}

export function SelectionInsightPanel(props: SelectionInsightPanelProps) {
    const { open, sentence, anchorRect, initialTab, loadTranslation, loadGrammar, onClose } = props;
    const [tab, setTab] = React.useState<InsightTab>(initialTab);
    const [, force] = React.useReducer((x) => x + 1, 0);
    const cacheRef = React.useRef<Map<string, CacheEntry>>(new Map());
    const isDesktop = useMediaIsDesktop();
    const panelRef = React.useRef<HTMLDivElement>(null);

    const key = sentence;

    const entry = React.useCallback((): CacheEntry => {
        let e = cacheRef.current.get(key);
        if (!e) {
            e = {};
            cacheRef.current.set(key, e);
        }
        return e;
    }, [key]);

    const ensure = React.useCallback(
        (t: InsightTab) => {
            const e = entry();
            const slot = t === 'translate' ? e.translate : e.grammar;
            if (slot && (slot.loading || slot.data !== undefined || slot.error !== undefined)) return;

            const loader = t === 'translate' ? loadTranslation : loadGrammar;
            const next: CacheSlot = { loading: true };
            if (t === 'translate') e.translate = next;
            else e.grammar = next;
            force();

            loader(sentence)
                .then((data) => {
                    if (t === 'translate') e.translate = { loading: false, data };
                    else e.grammar = { loading: false, data };
                })
                .catch((err) => {
                    const msg = err instanceof Error ? err.message : '加载失败';
                    if (t === 'translate') e.translate = { loading: false, error: msg };
                    else e.grammar = { loading: false, error: msg };
                })
                .finally(() => force());
        },
        [entry, loadGrammar, loadTranslation, sentence]
    );

    React.useEffect(() => {
        if (!open) return;
        setTab(initialTab);
        ensure(initialTab);
    }, [open, initialTab, ensure, key]);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    React.useEffect(() => {
        if (!open) return;
        const onMouseDown = (ev: MouseEvent) => {
            const el = panelRef.current;
            if (el && ev.target instanceof Node && el.contains(ev.target)) return;
            onClose();
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [open, onClose]);

    if (!open) return null;

    const e = entry();
    const active = tab === 'translate' ? e.translate : e.grammar;

    const floatingStyle: React.CSSProperties = (() => {
        if (!isDesktop || !anchorRect) return {};
        const width = Math.min(440, Math.max(320, Math.floor(window.innerWidth * 0.3)));
        const gap = 8;
        const margin = 16;
        let top = anchorRect.bottom + gap;
        const estimatedHeight = 260;
        if (top + estimatedHeight > window.innerHeight - margin) {
            top = Math.max(margin, anchorRect.top - gap - estimatedHeight);
        }
        let left = anchorRect.left + anchorRect.width / 2 - width / 2;
        left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
        return { position: 'fixed', top, left, width, zIndex: 60 };
    })();

    const panel = (
        <div
            ref={panelRef}
            id="selection-insight-panel"
            className={cn(
                'rounded-2xl border border-slate-200 bg-white/98 shadow-2xl backdrop-blur-sm',
                isDesktop
                    ? 'hidden md:flex md:flex-col'
                    : 'fixed inset-x-0 bottom-0 z-[60] flex max-h-[70vh] flex-col rounded-b-none pb-[env(safe-area-inset-bottom,0px)] md:hidden'
            )}
            style={isDesktop ? floatingStyle : undefined}
            onMouseDown={(ev) => ev.stopPropagation()}
        >
            {!isDesktop && (
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300/80" aria-hidden />
            )}
            <header className="flex items-start gap-2 border-b border-slate-100 p-3">
                <p className="line-clamp-2 flex-1 text-xs italic text-slate-600" title={sentence}>
                    “{sentence}”
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-700"
                    onClick={onClose}
                    aria-label="关闭"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </header>
            <nav className="flex gap-1 border-b border-slate-100 px-2 pt-2" role="tablist">
                {(['translate', 'grammar'] as const).map((t) => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => {
                            setTab(t);
                            ensure(t);
                        }}
                        className={cn(
                            'rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
                            tab === t
                                ? 'border-teal-600 text-teal-800'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        )}
                    >
                        {t === 'translate' ? '翻译（中文）' : '语法分析'}
                    </button>
                ))}
            </nav>
            <div className="min-h-[96px] overflow-auto px-3 py-3 text-sm leading-relaxed text-slate-800">
                {!active || active.loading ? (
                    <p className="flex items-center gap-1 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {tab === 'translate' ? '翻译中…' : '分析中…'}
                    </p>
                ) : active.error ? (
                    <p className="text-rose-600">{active.error}</p>
                ) : (
                    <p className="whitespace-pre-wrap">{active.data}</p>
                )}
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(panel, document.body) : null;
}

