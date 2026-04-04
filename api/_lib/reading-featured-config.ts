/** 与 docs/.../featured-decision-log 一致 */

export type FeaturedCategoryDef = {
    id: string;
    labelZh: string;
    domains: readonly string[];
};

export const FEATURED_CATEGORIES: readonly FeaturedCategoryDef[] = [
    {
        id: 'news_world',
        labelZh: '全球时事',
        domains: [
            'theguardian.com',
            'time.com',
            'npr.org',
            'vox.com',
            'theatlantic.com',
            'aeon.co',
        ],
    },
    {
        id: 'science_nature',
        labelZh: '科学与自然',
        domains: ['nature.com', 'newscientist.com', 'nationalgeographic.com'],
    },
    {
        id: 'tech',
        labelZh: '科技前沿',
        domains: ['wired.com', 'technologyreview.com'],
    },
    {
        id: 'business',
        labelZh: '商业与财经',
        domains: ['economist.com', 'bloomberg.com', 'hbr.org'],
    },
] as const;

export function hostnameMatchesAllowlist(hostname: string, domains: readonly string[]): boolean {
    const h = hostname.toLowerCase().replace(/^www\./, '');
    return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

export function urlMatchesCategoryDomains(url: string, domains: readonly string[]): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return hostnameMatchesAllowlist(host, domains);
    } catch {
        return false;
    }
}
