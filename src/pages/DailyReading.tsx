import * as React from 'react';
import { BookOpen, Loader2, Search, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import { platformSearch, platformExtractMarkdown, type SearchHit } from '@/lib/reading-platform-api';
import { fetchFeaturedDaily, type FeaturedBundleItem } from '@/lib/reading-featured-api';
import { generateReadingArticle, GENERATE_EXPECTED_MS } from '@/lib/reading-generate-api';
import { estimateReadingDifficulty } from '@/lib/reading-ai';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
    useReadingLibraryStore,
    isInLibrary,
    type ReadingDifficulty,
} from '@/store/readingLibraryStore';
import { ReadingArticleView } from '@/pages/ReadingArticle';

const QUICK_TOPICS_AI = [
    '人工智能发展趋势',
    '太空探索最新进展',
    '心理健康小贴士',
    '可持续生活方式',
    '商务英语场景',
    '职场沟通技巧',
    '健康饮食科普',
    '欧洲旅行见闻',
] as const;

const QUICK_TOPICS_WEB = [
    'technology news',
    'climate science',
    'culture essay',
    'business English',
    'health tips',
    'travel story',
] as const;

const DIFF_LABELS: Record<number, string> = {
    1: '入门',
    2: '基础',
    3: '中级',
    4: '进阶',
    5: '高阶',
};

type DailyTab = 'featured' | 'generate' | 'web' | 'library';

const TAB_ITEMS: { id: DailyTab; label: string; hint: string }[] = [
    { id: 'featured', label: '今日精选', hint: '每日 AI 生成的学习文章，含词汇与测验' },
    { id: 'generate', label: '自选主题', hint: '输入你感兴趣的话题，让 AI 现场写一篇' },
    { id: 'web', label: '外刊原文', hint: '联网检索真实外刊，抓取正文（可能受网络限制）' },
    { id: 'library', label: '我的书库', hint: '已经读过或保存的文章' },
];

function excerptFromArticle(a: {
    content: string;
    summaryText?: string;
    summaryOnly?: boolean;
    summary?: string;
}): string {
    if (a.summary && a.summary.trim()) return a.summary.trim();
    const src =
        a.summaryOnly && a.summaryText?.trim()
            ? a.summaryText.trim()
            : a.content.trim().replace(/\s+/g, ' ');
    return src.length > 160 ? `${src.slice(0, 160)}…` : src;
}

function labelForSource(t: string): string {
    if (t === 'user_import') return '用户导入';
    if (t === 'ai_generated') return 'AI 生成';
    return '联网精选';
}

/**
 * 自选主题生成时的进度展示：
 *   - 进度条：基于时间线性推进，到 85% 时变缓直至 95%，等待服务端 resolve 后外部再切到 100%
 *   - 阶段文案：按进度区间给出拟人化提示，比"转圈圈"更有存在感
 *
 * 之所以不用服务端的真实进度：Vercel Node.js Serverless 对 SSE 流式有缓冲，
 * 在某些客户端表现为 "Failed to fetch"；改为"一次性 JSON 响应 + 前端时间动画"更稳。
 */
function GenerationProgress({ startedAt }: { startedAt: number }) {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 200);
        return () => window.clearInterval(id);
    }, []);

    const elapsed = Math.max(0, now - startedAt);

    /**
     * 进度曲线：前 85% 在预期时间内线性走完，
     * 之后用指数衰减缓缓逼近 95%，避免卡死/超预期时一直停在 85%。
     */
    const expected = GENERATE_EXPECTED_MS;
    const linearPortion = 0.85;
    let ratio: number;
    if (elapsed < expected) {
        ratio = (elapsed / expected) * linearPortion;
    } else {
        /** 超时后从 0.85 向 0.95 慢速靠拢：每多 5 秒推进约一半距离 */
        const overshoot = elapsed - expected;
        const halfLife = 5000;
        const remaining = 0.95 - linearPortion;
        ratio = 0.95 - remaining * Math.pow(0.5, overshoot / halfLife);
    }
    ratio = Math.max(0.03, Math.min(0.95, ratio));

    let stageLabel = '正在连接 AI…';
    if (elapsed > 1200 && ratio < 0.25) stageLabel = '正在构思文章结构…';
    else if (ratio < 0.55) stageLabel = '正在撰写正文…';
    else if (ratio < 0.78) stageLabel = '正在挑选重点词汇…';
    else if (ratio < 0.9) stageLabel = '正在生成阅读理解题…';
    else stageLabel = '即将完成，正在整理…';

    return (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-white/90 p-3">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{stageLabel}</span>
                <span className="tabular-nums text-slate-500">{Math.round(ratio * 100)}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-[width] duration-200 ease-out"
                    style={{ width: `${ratio * 100}%` }}
                />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                即使你切到别的模块，生成会继续进行；完成后文章会出现在下方「我最近生成的」，点文章顶部「加入书库」可长期保留。
            </p>
        </div>
    );
}

export function DailyReadingPage() {
    const articles = useReadingLibraryStore((s) => s.articles);
    const addOrGetByUrl = useReadingLibraryStore((s) => s.addOrGetByUrl);
    const addUserImport = useReadingLibraryStore((s) => s.addUserImport);
    const addAiArticle = useReadingLibraryStore((s) => s.addAiArticle);
    const remove = useReadingLibraryStore((s) => s.remove);
    const updateDifficulty = useReadingLibraryStore((s) => s.updateDifficulty);

    const { toast } = useToast();

    // 外刊原文 tab 状态
    const [query, setQuery] = React.useState('');
    const [hits, setHits] = React.useState<SearchHit[]>([]);
    const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
    const [searching, setSearching] = React.useState(false);
    const [importing, setImporting] = React.useState(false);

    // 导入 tab 状态
    const [importTitle, setImportTitle] = React.useState('');
    const [importBody, setImportBody] = React.useState('');

    // 自选主题 tab 状态
    const [genTopic, setGenTopic] = React.useState('');
    const [genDifficulty, setGenDifficulty] = React.useState<ReadingDifficulty>(3);
    const [generating, setGenerating] = React.useState(false);
    /** 触发进度条开始计时的时间戳（生成开始时写入）；为 null 时隐藏进度 */
    const [genStartedAt, setGenStartedAt] = React.useState<number | null>(null);

    const [openId, setOpenId] = React.useState<string | null>(null);
    const [activeTab, setActiveTab] = React.useState<DailyTab>('featured');

    // 今日精选状态
    const [featuredItems, setFeaturedItems] = React.useState<FeaturedBundleItem[]>([]);
    const [featuredDateKey, setFeaturedDateKey] = React.useState<string | null>(null);
    const [featuredLoading, setFeaturedLoading] = React.useState(true);
    const [featuredError, setFeaturedError] = React.useState<string | null>(null);
    const [openingFeaturedId, setOpeningFeaturedId] = React.useState<string | null>(null);

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

    /** 打开今日精选文章：若已在库则直接打开；否则写入再打开。 */
    const openFeaturedItem = (item: FeaturedBundleItem) => {
        if (openingFeaturedId) return;
        setOpeningFeaturedId(item.id);
        try {
            const existing = articles.find(
                (a) => a.sourceType === 'ai_generated' && a.sourceTitle === item.title && a.content === item.body
            );
            if (existing) {
                setOpenId(existing.id);
                return;
            }
            const id = addAiArticle({
                title: item.title,
                content: item.body,
                difficulty: item.difficulty,
                summary: item.summary,
                keyVocabulary: item.keyVocabulary,
                keyPhrases: item.keyPhrases,
                quiz: item.quiz,
                topic: item.topic,
                addedToLibrary: false,
                isUserGenerated: false,
            });
            setOpenId(id);
        } finally {
            setOpeningFeaturedId(null);
        }
    };

    const submitGenerate = async () => {
        const topic = genTopic.trim();
        if (!topic) {
            toast('请输入你想读的话题', 'error');
            return;
        }
        setGenerating(true);
        setGenStartedAt(Date.now());
        try {
            const res = await generateReadingArticle({
                topic,
                difficulty: genDifficulty,
            });
            const a = res.article;
            const id = addAiArticle({
                title: a.title,
                content: a.body,
                difficulty: a.difficulty,
                summary: a.summary,
                keyVocabulary: a.keyVocabulary,
                keyPhrases: a.keyPhrases,
                quiz: a.quiz,
                topic,
                addedToLibrary: false,
                isUserGenerated: true,
            });
            toast('已生成，可在文章页点「加入书库」保留', 'success');
            setOpenId(id);
            setGenTopic('');
        } catch (e) {
            toast(e instanceof Error ? e.message : '生成失败', 'error');
        } finally {
            setGenerating(false);
            setGenStartedAt(null);
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
                    diff = await estimateReadingDifficulty(title, md.slice(0, 800));
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

    /**
     * 最近「自选主题」生成的 5 篇文章（按生成时间倒序）。
     * 只显示用户主动生成的，不包含今日精选点击阅读时缓存下来的 AI 文章。
     */
    const recentAiArticles = React.useMemo(() => {
        return [...articles]
            .filter((a) => a.sourceType === 'ai_generated' && a.isUserGenerated === true)
            .sort((a, b) => b.fetchedAt - a.fetchedAt)
            .slice(0, 5);
    }, [articles]);

    /** 我的书库：只显示已被用户主动加入书库的文章 */
    const libraryArticles = React.useMemo(() => {
        return [...articles].filter(isInLibrary).sort((a, b) => b.fetchedAt - a.fetchedAt);
    }, [articles]);

    if (openId) {
        return (
            <ReadingArticleView
                key={openId}
                articleId={openId}
                onBack={() => setOpenId(null)}
            />
        );
    }

    const activeTabMeta = TAB_ITEMS.find((t) => t.id === activeTab);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-800">每日阅读</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    今日精选每天由 AI 生成 8 篇学习文章，含重点词汇与随文测验；也可以自选主题即时生成，或导入外刊。
                </p>
            </div>

            <div className="-mx-1 overflow-x-auto border-b border-slate-100 pb-px">
                <div className="flex min-w-0 gap-1 px-1">
                    {TAB_ITEMS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveTab(t.id)}
                            className={cn(
                                'shrink-0 min-h-[44px] rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
                                activeTab === t.id
                                    ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-100'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTabMeta ? (
                <p className="-mt-4 text-xs text-slate-500">{activeTabMeta.hint}</p>
            ) : null}

            {activeTab === 'featured' ? (
                <section className="rounded-2xl border border-teal-100/80 bg-gradient-to-b from-teal-50/40 to-white/90 p-4 shadow-sm ring-1 ring-teal-100/60 backdrop-blur-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Sparkles className="h-4 w-4 text-teal-600" />
                            今日精选 · AI 生成
                        </h2>
                        {featuredDateKey ? (
                            <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-100">
                                今日 {featuredDateKey}
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        每天凌晨基于当日热点话题与固定主题池生成 8 篇学习文章，阅读流畅、难度分层、随文附带词汇卡片和理解题。
                    </p>

                    {featuredLoading ? (
                        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                            正在加载今日精选…
                        </div>
                    ) : featuredError ? (
                        <p className="mt-4 text-sm text-amber-800/90">
                            精选暂不可用：{featuredError}
                            <span className="mt-1 block text-xs text-slate-500">
                                请确认已配置 VITE_READING_API_BASE、DEEPSEEK_API_KEY、KV；可改用「自选主题」即时生成。
                            </span>
                        </p>
                    ) : featuredItems.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-500">今日暂无推荐条目，请稍后再试或使用「自选主题」。</p>
                    ) : (
                        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {featuredItems.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex flex-col rounded-xl border border-slate-100/90 bg-white/90 p-3 shadow-sm"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-1">
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                            {item.source === 'hot' ? '热点话题' : '精选主题'}
                                        </span>
                                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-teal-100">
                                            {DIFF_LABELS[item.difficulty]}
                                        </span>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
                                        {item.title}
                                    </p>
                                    {item.summary ? (
                                        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">
                                            {item.summary}
                                        </p>
                                    ) : null}
                                    <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-500">
                                        <span>词汇 {item.keyVocabulary?.length ?? 0}</span>
                                        <span>·</span>
                                        <span>测验 {item.quiz?.length ?? 0} 题</span>
                                    </div>
                                    <Button
                                        type="button"
                                        className="mt-3 w-full gap-1 bg-teal-600 text-white hover:bg-teal-700"
                                        disabled={!!openingFeaturedId}
                                        onClick={() => openFeaturedItem(item)}
                                    >
                                        {openingFeaturedId === item.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <BookOpen className="h-3.5 w-3.5" />
                                        )}
                                        开始阅读
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ) : null}

            {activeTab === 'generate' ? (
                <section className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white/90 p-4 shadow-sm ring-1 ring-indigo-100/60">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Wand2 className="h-4 w-4 text-indigo-600" />
                        自选主题 · 即时生成
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        告诉 AI 你今天想读什么，无论是「北极光的形成」还是「最近的 GPT 新闻」，几秒钟就能拿到一篇带词汇卡片与测验的文章。
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                        <input
                            value={genTopic}
                            onChange={(e) => setGenTopic(e.target.value)}
                            placeholder="例如：量子计算的基本原理 / My recent travel to Kyoto"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !generating) void submitGenerate();
                            }}
                            disabled={generating}
                            maxLength={200}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                                难度
                                <select
                                    value={genDifficulty}
                                    onChange={(e) =>
                                        setGenDifficulty(Number(e.target.value) as ReadingDifficulty)
                                    }
                                    disabled={generating}
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                                >
                                    {([1, 2, 3, 4, 5] as const).map((d) => (
                                        <option key={d} value={d}>
                                            {DIFF_LABELS[d]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <Button
                                type="button"
                                disabled={generating || !genTopic.trim()}
                                onClick={() => void submitGenerate()}
                                className="ml-auto bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        生成中…
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="mr-2 h-4 w-4" />
                                        生成文章
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {QUICK_TOPICS_AI.map((t) => (
                            <button
                                key={t}
                                type="button"
                                className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-800"
                                onClick={() => setGenTopic(t)}
                                disabled={generating}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    {generating && genStartedAt !== null ? (
                        <GenerationProgress startedAt={genStartedAt} />
                    ) : null}

                    {recentAiArticles.length > 0 ? (
                        <div className="mt-6 border-t border-slate-100 pt-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                                我最近生成的
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                    {recentAiArticles.length}
                                </span>
                            </h3>
                            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {recentAiArticles.map((a) => (
                                    <li
                                        key={a.id}
                                        className="group flex flex-col rounded-xl border border-slate-100 bg-white/90 p-3 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800 line-clamp-2">
                                                {a.sourceTitle}
                                            </p>
                                            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                                                {DIFF_LABELS[a.difficulty]}
                                            </span>
                                        </div>
                                        {a.summary ? (
                                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                                                {a.summary}
                                            </p>
                                        ) : a.topic ? (
                                            <p className="mt-1 text-xs text-slate-500">话题：{a.topic}</p>
                                        ) : null}
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span className="text-xs text-slate-500">
                                                {new Date(a.fetchedAt).toLocaleString('zh-CN', {
                                                    month: 'numeric',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                                {a.addedToLibrary ? (
                                                    <span className="ml-2 inline-flex items-center rounded-full bg-teal-50 px-1.5 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
                                                        已在书库
                                                    </span>
                                                ) : null}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    aria-label="删除此文章"
                                                    title="删除"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                    onClick={() => {
                                                        if (window.confirm(`确认删除「${a.sourceTitle}」？该操作不可撤销。`)) {
                                                            remove(a.id);
                                                            toast('已删除', 'default');
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-9 text-xs text-indigo-700 hover:bg-indigo-50"
                                                    onClick={() => setOpenId(a.id)}
                                                >
                                                    继续阅读 →
                                                </Button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {activeTab === 'web' ? (
                <section className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm ring-1 ring-white/80 backdrop-blur-sm">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Search className="h-4 w-4 text-teal-600" />
                        外刊原文 · 联网检索
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-amber-800/80">
                        直连外网搜索真实外刊，部分站点在国内网络可能无法打开，正文抽取质量也取决于原站结构。遇到问题推荐改用「自选主题」或「今日精选」。
                    </p>
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
                        {QUICK_TOPICS_WEB.map((t) => (
                            <button
                                key={t}
                                type="button"
                                className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                                onClick={() => setQuery(t)}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    {hits.length > 0 ? (
                        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
                            {hits.map((h) => (
                                <li
                                    key={h.url}
                                    className="flex gap-2 rounded-lg border border-slate-100/80 bg-slate-50/50 p-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={picked.has(h.url)}
                                        onChange={() => togglePick(h.url)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-slate-800">{h.title}</p>
                                        <p className="truncate text-xs text-slate-500">{h.url}</p>
                                        {h.snippet ? (
                                            <p className="mt-1 text-xs text-slate-600 line-clamp-2">{h.snippet}</p>
                                        ) : null}
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
            ) : null}

            {activeTab === 'library' ? (
                <section className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm">
                    <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <BookOpen className="h-4 w-4 text-teal-600" />
                        我的书库 ({libraryArticles.length})
                    </h2>
                    <p className="mb-3 text-xs leading-relaxed text-slate-500">
                        只显示你主动加入的文章。今日精选、自选主题默认不入库，阅读时可在文章顶部点「加入书库」保留。
                    </p>

                    <details className="mb-3">
                        <summary className="cursor-pointer text-xs text-slate-600 hover:text-slate-800">
                            导入本地文本 / 粘贴外刊段落
                        </summary>
                        <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                <Upload className="h-3.5 w-3.5 text-teal-600" />
                                导入文本
                            </div>
                            <input
                                type="file"
                                accept=".txt,text/plain"
                                className="mt-2 text-sm"
                                onChange={handleTxtFile}
                            />
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
                                rows={5}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                            <Button type="button" className="mt-3" onClick={submitUserImport}>
                                加入书库
                            </Button>
                        </div>
                    </details>

                    {libraryArticles.length === 0 ? (
                        <p className="text-sm text-slate-500">
                            暂无文章。在「今日精选」/「自选主题」阅读时点顶部「加入书库」可把喜欢的文章留在这里。
                        </p>
                    ) : (
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {libraryArticles.map((a) => {
                                    const preview = excerptFromArticle(a);
                                    return (
                                        <li
                                            key={a.id}
                                            className="relative flex flex-col rounded-xl border border-slate-100/90 bg-white/90 p-3 shadow-sm"
                                        >
                                            <span className="absolute right-2 top-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-teal-100">
                                                {DIFF_LABELS[a.difficulty]}
                                            </span>
                                            <p className="pr-16 text-sm font-semibold leading-snug text-slate-800">
                                                {a.sourceTitle}
                                            </p>
                                            {preview ? (
                                                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">
                                                    {preview}
                                                </p>
                                            ) : null}
                                            <p className="mt-2 text-xs text-slate-500">
                                                {labelForSource(a.sourceType)} ·{' '}
                                                {new Date(a.fetchedAt).toLocaleDateString()}
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-50 pt-3">
                                                <label className="flex items-center gap-1 text-xs text-slate-500">
                                                    难度
                                                    <select
                                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                                                        value={a.difficulty}
                                                        onChange={(e) =>
                                                            updateDifficulty(
                                                                a.id,
                                                                Number(e.target.value) as ReadingDifficulty
                                                            )
                                                        }
                                                    >
                                                        {([1, 2, 3, 4, 5] as const).map((d) => (
                                                            <option key={d} value={d}>
                                                                {DIFF_LABELS[d]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <Button
                                                    type="button"
                                                    onClick={() => setOpenId(a.id)}
                                                >
                                                    阅读
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => remove(a.id)}
                                                >
                                                    删除
                                                </Button>
                                            </div>
                                        </li>
                                    );
                                })}
                        </ul>
                    )}
                </section>
            ) : null}

        </div>
    );
}
