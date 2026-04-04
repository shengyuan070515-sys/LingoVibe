import { canonicalizeUrl } from '@/lib/reading-url';
import { FEATURED_CATEGORIES, urlMatchesCategoryDomains, type FeaturedCategoryDef } from './reading-featured-config.js';
import { searchTavily, type TavilySearchHit } from './tavily-search.js';

export type FeaturedBundleItem = {
    categoryId: string;
    categoryLabelZh: string;
    url: string;
    title: string;
    snippet: string;
};

export type FeaturedBundle = {
    dateKey: string;
    generatedAt: number;
    version: number;
    items: FeaturedBundleItem[];
};

const QUERY_TOPICS = [
    'world news',
    'analysis',
    'science',
    'climate',
    'business',
    'technology',
    'culture',
    'opinion',
    'economy',
    'health',
] as const;

function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function shuffleCopy<T>(arr: readonly T[], seed: string): T[] {
    const out = [...arr];
    let h = hashString(seed);
    for (let i = out.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) & 0x7fffffff;
        const j = h % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function pickTopicIndex(dateKey: string, categoryId: string, domain: string, salt: number): number {
    return hashString(`${dateKey}|${categoryId}|${domain}|${salt}`) % QUERY_TOPICS.length;
}

function hitToItem(
    hit: TavilySearchHit,
    cat: FeaturedCategoryDef,
    globalSeen: Set<string>
): FeaturedBundleItem | null {
    const canonical = canonicalizeUrl(hit.url);
    if (canonical === null) return null;
    if (!urlMatchesCategoryDomains(hit.url, cat.domains)) return null;
    if (globalSeen.has(canonical)) return null;
    globalSeen.add(canonical);
    return {
        categoryId: cat.id,
        categoryLabelZh: cat.labelZh,
        url: hit.url,
        title: hit.title,
        snippet: hit.snippet,
    };
}

async function fillCategory(
    cat: FeaturedCategoryDef,
    dateKey: string,
    apiKey: string,
    globalSeen: Set<string>,
    targetCount: number
): Promise<FeaturedBundleItem[]> {
    const picked: FeaturedBundleItem[] = [];
    const domains = shuffleCopy(cat.domains, `${dateKey}:${cat.id}`);

    const maxPasses = 12;
    for (let pass = 0; pass < maxPasses && picked.length < targetCount; pass++) {
        for (const domain of domains) {
            if (picked.length >= targetCount) break;
            const topic = QUERY_TOPICS[pickTopicIndex(dateKey, cat.id, domain, pass)];
            const q = `site:${domain} ${topic}`;
            let hits: TavilySearchHit[];
            try {
                hits = await searchTavily(q, apiKey, 10);
            } catch {
                continue;
            }
            for (const h of hits) {
                const item = hitToItem(h, cat, globalSeen);
                if (item) {
                    picked.push(item);
                    if (picked.length >= targetCount) break;
                }
            }
        }
    }

    return picked;
}

/** 每大类 2 篇，共 8 篇；不足 8 则返回已收集部分 */
export async function generateFeaturedBundle(dateKey: string, apiKey: string): Promise<FeaturedBundle> {
    const globalSeen = new Set<string>();
    const items: FeaturedBundleItem[] = [];

    for (const cat of FEATURED_CATEGORIES) {
        const part = await fillCategory(cat, dateKey, apiKey, globalSeen, 2);
        items.push(...part);
    }

    return {
        dateKey,
        generatedAt: Date.now(),
        version: 1,
        items,
    };
}
