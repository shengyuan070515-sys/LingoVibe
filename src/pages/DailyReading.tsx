import * as React from 'react';
import { BookOpen, Globe, Loader2, Search, Sparkles, Upload } from 'lucide-react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { platformSearch, platformExtractMarkdown, type SearchHit } from '@/lib/reading-platform-api';
import { fetchFeaturedDaily, type FeaturedBundleItem } from '@/lib/reading-featured-api';
import { estimateReadingDifficulty } from '@/lib/reading-ai';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useReadingLibraryStore, type ReadingDifficulty } from '@/store/readingLibraryStore';
import { ReadingArticleView } from '@/pages/ReadingArticle';

const QUICK_TOPICS = [
    'technology news',
    'climate science',
    'culture essay',
    'business English',
    'health tips',
    'travel story',
];

const DIFF_LABELS: Record<number, string> = {
    1: '入门',
    2: '基础',
    3: '中级',
    4: '进阶',
    5: '高阶',
};

const FEATURED_SOURCES_LINE =
    '精选自《卫报》《经济学人》《自然》《新科学家》《国家地理》《时代周刊》、哈佛商业评论（HBR）、彭博社、NPR、Vox、Aeon、《大西洋月刊》《连线》、麻省理工科技评论等';

export interface DailyReadingPageProps {
    onNavigateToSettings?: () => void;
}

export function DailyReadingPage({ onNavigateToSettings }: DailyReadingPageProps) {
    const articles = useReadingLibraryStore((s) => s.articles);
    const addOrGetByUrl = useReadingLibraryStore((s) => s.addOrGetByUrl);
    const addUserImport = useReadingLibraryStore((s) => s.addUserImport);
    const remove = useReadingLibraryStore((s) => s.remove);
    const updateDifficulty = useReadingLibraryStore((s) => s.updateDifficulty);

    const [readingKey] = useLocalStorage('reading_api_key', '');

    const { toast } = useToast();

    const [query, setQuery] = React.useState('');
    const [hits, setHits] = React.useState<SearchHit[]>([]);
    const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
    const [searching, setSearching] = React.useState(false);
    const [importing, setImporting] = React.useState(false);

    const [importTitle, setImportTitle] = React.useState('');
    const [importBody, setImportBody] = React.useState('');

    const [openId, setOpenId] = React.useState<string | null>(null);

    const [featuredItems, setFeaturedItems] = React.useState<FeaturedBundleItem[]>([]);
    const [featuredDateKey, setFeaturedDateKey] = React.useState<string | null>(null);
    const [featuredLoading, setFeaturedLoading] = React.useState(true);
    const [featuredError, setFeaturedError] = React.useState<string | null>(null);
    const [openingFeaturedUrl, setOpeningFeaturedUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setFeaturedLoading(true);
            setFeaturedError(null);
            try {
                const bundle = await fetchFeaturedDaily();
                if (!cancelled) {
                    setFeaturedItems(bundle.items);
                    setFeaturedDateKey(bundle.dateKey);
                }
            } catch (e) {
                if (!cancelled) {
                    setFeaturedError(e instanceof Error ? e.message : '精选加载失败');
                    setFeaturedItems([]);
                    setFeaturedDateKey(null);
                }
            } finally {
                if (!cancelled) setFeaturedLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const openFeaturedItem = async (item: FeaturedBundleItem) => {
        if (openingFeaturedUrl) return;
        if (!readingKey.trim()) {
            toast('请先在设置中填写每日阅读 DeepSeek Key（用于难度估计）', 'error');
            return;
        }
        setOpeningFeaturedUrl(item.url);
        try {
            let md = '';
            try {
                md = await platformExtractMarkdown(item.url);
            } catch {
                md = '';
            }

            const slice = md.trim() ? md.slice(0, 800) : item.snippet;
            let diff: ReadingDifficulty = 3;
            try {
                diff = await estimateReadingDifficulty(readingKey.trim(), item.title, slice);
            } catch {
                diff = 3;
            }

            if (md.trim()) {
                const res = addOrGetByUrl({
                    url: item.url,
                    title: item.title,
                    content: md,
                    difficulty: diff,
                });
                if (res.ok) {
                    setOpenId(res.id);
                    if (res.duplicate) toast('已在书库，已打开', 'default');
                } else if (res.reason === 'empty_content') {
                    toast('正文为空', 'error');
                } else {
                    toast('链接无效', 'error');
                }
            } else {
                const res = addOrGetByUrl({
                    url: item.url,
                    title: item.title,
                    content: '',
                    difficulty: diff,
                    summaryOnly: true,
                    summaryText: item.snippet.trim() || '（暂无法抓取正文，请以官网为准。）',
                });
                if (res.ok) {
                    setOpenId(res.id);
                    if (res.duplicate) toast('已在书库，已打开', 'default');
                } else if (res.reason === 'empty_content') {
                    toast('无法创建摘要条目', 'error');
                } else {
                    toast('链接无效', 'error');
                }
            }
        } catch (e) {
            toast(e instanceof Error ? e.message : '打开失败', 'error');
        } finally {
            setOpeningFeaturedUrl(null);
        }
    };

    const runSearch = async () => {
        const q = query.trim();
        if (!q) {
            toast('请输入关键词或主题', 'error');
            return;
        }
        setSearching(true);
        setHits([]);
        setPicked(new Set());
        try {
            const list = await platformSearch(q);
            setHits(list);
            if (list.length === 0) toast('没有搜索结果，可换关键词重试', 'default');
        } catch (e) {
            toast(e instanceof Error ? e.message : '搜索失败', 'error');
        } finally {
            setSearching(false);
        }
    };

    const togglePick = (url: string) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url);
            else next.add(url);
            return next;
        });
    };

    const ingestSelected = async () => {
        if (picked.size === 0) {
            toast('请先勾选文章', 'error');
            return;
        }
        if (!readingKey.trim()) {
            toast('请先在设置中填写每日阅读 DeepSeek Key（用于难度估计）', 'error');
            return;
        }
        setImporting(true);
        try {
            for (const url of picked) {
                const hit = hits.find((h) => h.url === url);
                const title = hit?.title ?? url;
                let md: string;
                try {
                    md = await platformExtractMarkdown(url);
                } catch (e) {
                    toast(`${title}: ${e instanceof Error ? e.message : '抽取失败'}`, 'error');
                    continue;
                }
                if (!md.trim()) {
                    toast(`${title}: 正文为空，已跳过`, 'error');
                    continue;
                }
                let diff: ReadingDifficulty = 3;
                try {
                    diff = await estimateReadingDifficulty(readingKey.trim(), title, md.slice(0, 800));
                } catch {
                    diff = 3;
                }
                const res = addOrGetByUrl({ url, title, content: md, difficulty: diff });
                if (!res.ok) {
                    toast('链接无效，已跳过', 'error');
                    continue;
                }
                if (res.duplicate) {
                    toast(`「${title}」已在书库`, 'default');
                    setOpenId(res.id);
                } else {
                    toast(`已入库：${title}`, 'success');
                }
            }
            setPicked(new Set());
        } finally {
            setImporting(false);
        }
    };

    const handleTxtFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = typeof reader.result === 'string' ? reader.result : '';
            setImportBody(text);
            if (!importTitle.trim()) setImportTitle(file.name.replace(/\.txt$/i, ''));
        };
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    };

    const submitUserImport = () => {
        const body = importBody.trim();
        if (!body) {
            toast('请粘贴正文或上传 .txt', 'error');
            return;
        }
        const title = importTitle.trim() || '用户导入';
        const id = addUserImport({ title, content: body });
        toast('已加入书库', 'success');
        setImportTitle('');
        setImportBody('');
        setOpenId(id);
    };

    if (openId) {
        return (
            <ReadingArticleView
                key={openId}
                articleId={openId}
                onBack={() => setOpenId(null)}
                onNavigateToSettings={onNavigateToSettings}
            />
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
            <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-800">每日阅读</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    联网搜索后勾选入库，或粘贴/导入文本。打开文章后滚动至文末并满足停留时间，即可计入今日阅读闭环。
                </p>
            </div>

            <section className="rounded-2xl border border-teal-100/80 bg-gradient-to-b from-teal-50/40 to-white/90 p-4 shadow-sm ring-1 ring-teal-100/60 backdrop-blur-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Sparkles className="h-4 w-4 text-teal-600" />
                        AI 每日精选外刊
                    </h2>
                    {featuredDateKey ? (
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-100">
                            今日 {featuredDateKey}
                        </span>
                    ) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{FEATURED_SOURCES_LINE}</p>
                {featuredLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                        正在加载今日推荐…
                    </div>
                ) : featuredError ? (
                    <p className="mt-4 text-sm text-amber-800/90">
                        精选暂不可用：{featuredError}
                        <span className="mt-1 block text-xs text-slate-500">
                            请确认已配置 VITE_READING_API_BASE、TAVILY_API_KEY、KV（KV_REST_API_URL / TOKEN）；本地无 KV
                            时可设 READING_FEATURED_SKIP_KV=1 并 <code className="rounded bg-slate-100 px-1">vercel dev</code>{' '}
                            调试。也可用下方联网检索自选文章。
                        </span>
                    </p>
                ) : featuredItems.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">今日暂无推荐条目，请稍后再试或使用联网检索。</p>
                ) : (
                    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {featuredItems.map((item) => (
                            <li
                                key={`${item.categoryId}-${item.url}`}
                                className="flex flex-col rounded-xl border border-slate-100/90 bg-white/90 p-3 shadow-sm"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                        {item.categoryLabelZh}
                                    </span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{item.title}</p>
                                {item.snippet ? (
                                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">{item.snippet}</p>
                                ) : null}
                                <Button
                                    type="button"
                                    size="sm"
                                    className="mt-3 w-full gap-1 bg-teal-600 text-white hover:bg-teal-700"
                                    disabled={!!openingFeaturedUrl}
                                    onClick={() => void openFeaturedItem(item)}
                                >
                                    {openingFeaturedUrl === item.url ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Globe className="h-3.5 w-3.5" />
                                    )}
                                    阅读原文
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm ring-1 ring-white/80 backdrop-blur-sm">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Search className="h-4 w-4 text-teal-600" />
                    联网检索
                </h2>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="英文关键词或一句话主题"
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void runSearch();
                        }}
                    />
                    <Button type="button" disabled={searching} onClick={() => void runSearch()}>
                        {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        搜索
                    </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {QUICK_TOPICS.map((t) => (
                        <button
                            key={t}
                            type="button"
                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                            onClick={() => setQuery(t)}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                {hits.length > 0 ? (
                    <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
                        {hits.map((h) => (
                            <li key={h.url} className="flex gap-2 rounded-lg border border-slate-100/80 bg-slate-50/50 p-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={picked.has(h.url)}
                                    onChange={() => togglePick(h.url)}
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-800">{h.title}</p>
                                    <p className="truncate text-xs text-slate-500">{h.url}</p>
                                    {h.snippet ? <p className="mt-1 text-xs text-slate-600 line-clamp-2">{h.snippet}</p> : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {hits.length > 0 ? (
                    <Button
                        type="button"
                        className="mt-3"
                        disabled={importing || picked.size === 0}
                        onClick={() => void ingestSelected()}
                    >
                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        将选中项入库
                    </Button>
                ) : null}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm ring-1 ring-white/80 backdrop-blur-sm">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Upload className="h-4 w-4 text-teal-600" />
                    导入文本
                </h2>
                <input type="file" accept=".txt,text/plain" className="mt-2 text-sm" onChange={handleTxtFile} />
                <input
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder="标题（可选）"
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <textarea
                    value={importBody}
                    onChange={(e) => setImportBody(e.target.value)}
                    placeholder="粘贴英文正文…"
                    rows={6}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <Button type="button" className="mt-3" onClick={submitUserImport}>
                    加入书库
                </Button>
            </section>

            <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <BookOpen className="h-4 w-4 text-teal-600" />
                    我的书库 ({articles.length})
                </h2>
                {articles.length === 0 ? (
                    <p className="text-sm text-slate-500">暂无文章，先搜索或导入一篇吧。</p>
                ) : (
                    <ul className="space-y-2">
                        {[...articles]
                            .sort((a, b) => b.fetchedAt - a.fetchedAt)
                            .map((a) => (
                                <li
                                    key={a.id}
                                    className={cn(
                                        'flex flex-col gap-2 rounded-xl border border-slate-100 bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between'
                                    )}
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-slate-800">{a.sourceTitle}</p>
                                        <p className="text-xs text-slate-500">
                                            {a.sourceType === 'user_import' ? '用户导入' : '联网精选'} ·{' '}
                                            {DIFF_LABELS[a.difficulty]}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                                            value={a.difficulty}
                                            onChange={(e) =>
                                                updateDifficulty(a.id, Number(e.target.value) as ReadingDifficulty)
                                            }
                                        >
                                            {([1, 2, 3, 4, 5] as const).map((d) => (
                                                <option key={d} value={d}>
                                                    {DIFF_LABELS[d]}
                                                </option>
                                            ))}
                                        </select>
                                        <Button type="button" size="sm" onClick={() => setOpenId(a.id)}>
                                            阅读
                                        </Button>
                                        <Button type="button" size="sm" variant="ghost" onClick={() => remove(a.id)}>
                                            删除
                                        </Button>
                                    </div>
                                </li>
                            ))}
                    </ul>
                )}
            </section>

            <p className="text-[11px] leading-relaxed text-slate-500">
                联网搜索使用部署端的 Tavily（环境变量 TAVILY_API_KEY）；正文抽取仍经 Serverless。前端需配置
                VITE_READING_API_BASE。翻译与难度估计使用「设置」中的每日阅读 DeepSeek Key。
            </p>

            {onNavigateToSettings ? (
                <Button type="button" variant="outline" className="w-fit" onClick={onNavigateToSettings}>
                    打开设置
                </Button>
            ) : null}
        </div>
    );
}
