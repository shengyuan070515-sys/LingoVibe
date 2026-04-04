export type TavilySearchHit = { url: string; title: string; snippet: string };

type TavilyResult = {
    title?: string;
    url?: string;
    content?: string;
};

export async function searchTavily(
    query: string,
    apiKey: string,
    maxResults: number = 12
): Promise<TavilySearchHit[]> {
    const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults,
            search_depth: 'basic',
            topic: 'general',
            include_answer: false,
        }),
    });

    if (!r.ok) {
        const t = await r.text();
        throw new Error(`Tavily ${r.status}: ${t.slice(0, 300)}`);
    }

    const data = (await r.json()) as { results?: TavilyResult[] };
    const raw = Array.isArray(data.results) ? data.results : [];
    return raw
        .filter((item) => item.url && item.title)
        .map((item) => ({
            url: item.url as string,
            title: item.title as string,
            snippet: typeof item.content === 'string' ? item.content.slice(0, 500) : '',
        }));
}
