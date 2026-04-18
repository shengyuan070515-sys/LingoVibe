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

type CacheKey = `${string}::${InsightTab}`;
type Cache = Record<CacheKey, CacheSlot>;

function slotKey(sentence: string, tab: InsightTab): CacheKey {
    return `${sentence}::${tab}` as CacheKey;
}

export function SelectionInsightPanel(props: SelectionInsightPanelProps) {
    const { open, sentence, anchorRect, initialTab, loadTranslation, loadGrammar, onClose } = props;
    const [tab, setTab] = React.useState<InsightTab>(initialTab);
    const [cache, setCache] = React.useState<Cache>({});
    const firedRef = React.useRef<Set<CacheKey>>(new Set());
    const mountedRef = React.useRef(true);
    const isDesktop = useMediaIsDesktop();
    const panelRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Whenever we switch tabs or the sentence changes, kick off the loader
    // for that (sentence, tab) pair at most once.
    React.useEffect(() => {
        if (!open) return;
        const key = slotKey(sentence, tab);
        if (firedRef.current.has(key)) return;
        firedRef.current.add(key);

        setCache((prev) => ({ ...prev, [key]: { loading: true } }));

        const loader = tab === 'translate' ? loadTranslation : loadGrammar;
        loader(sentence)
            .then((data) => {
                if (!mountedRef.current) return;
                setCache((c) => ({ ...c, [key]: { loading: false, data } }));
            })
            .catch((err) => {
                if (!mountedRef.current) return;
                const msg = err instanceof Error ? err.message : '加载失败';
                setCache((c) => ({ ...c, [key]: { loading: false, error: msg } }));
            });
    }, [open, sentence, tab, loadGrammar, loadTranslation]);

    // When the panel is (re)opened for a new invocation, sync the active tab
    // to whatever the caller requested.
    React.useEffect(() => {
        if (!open) return;
        setTab(initialTab);
    }, [open, initialTab, sentence]);

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

    const active = cache[slotKey(sentence, tab)];

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
                'flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-xl',
                !isDesktop &&
                    'fixed inset-x-0 bottom-0 z-[60] max-h-[70vh] rounded-b-none pb-[env(safe-area-inset-bottom,0px)]'
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
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
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

