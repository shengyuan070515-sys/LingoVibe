/** Local date key YYYY-MM-DD (user's calendar day). */
export function toLocalDateKey(ts: number | Date): string {
    const d = typeof ts === 'number' ? new Date(ts) : ts;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function todayKey(): string {
    return toLocalDateKey(Date.now());
}

/** GitHub-style streak: today may be empty; then count from yesterday. */
export function computeLearningStreak(dailyActivity: Record<string, number>): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let check = new Date(today);
    const key = (d: Date) => toLocalDateKey(d.getTime());

    if ((dailyActivity[key(check)] ?? 0) === 0) {
        check.setDate(check.getDate() - 1);
    }

    let streak = 0;
    while ((dailyActivity[key(check)] ?? 0) > 0) {
        streak++;
        check.setDate(check.getDate() - 1);
    }
    return streak;
}

/** 0–4 intensity for heatmap cell */
export function activityIntensity(score: number): 0 | 1 | 2 | 3 | 4 {
    if (score <= 0) return 0;
    if (score <= 2) return 1;
    if (score <= 6) return 2;
    if (score <= 14) return 3;
    return 4;
}

const HEATMAP_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] as const;
const HEATMAP_COLORS_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] as const;

export function heatmapFill(level: 0 | 1 | 2 | 3 | 4, dark = false): string {
    const pal = dark ? HEATMAP_COLORS_DARK : HEATMAP_COLORS;
    return pal[level];
}

export interface HeatmapDay {
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
}

/** Last `weeks` weeks, columns = weeks, rows = weekday index 0–6 from `start` day. */
export function buildHeatmapGrid(
    dailyActivity: Record<string, number>,
    weeks = 14
): { grid: (HeatmapDay | null)[][] } {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (weeks * 7 - 1));

    const byDate: Record<string, number> = { ...dailyActivity };
    const grid: (HeatmapDay | null)[][] = Array.from({ length: 7 }, () =>
        Array.from({ length: weeks }, () => null)
    );

    for (let w = 0; w < weeks; w++) {
        for (let dow = 0; dow < 7; dow++) {
            const d = new Date(start);
            d.setDate(d.getDate() + w * 7 + dow);
            if (d > end) continue;

            const key = toLocalDateKey(d.getTime());
            const count = byDate[key] ?? 0;
            const level = activityIntensity(count);
            grid[dow][w] = { date: key, count, level };
        }
    }

    return { grid };
}

export interface LifetimeCounters {
    wordsAdded: number;
    chatMessages: number;
    visualLookups: number;
    readingSessions: number;
    srsReviews: number;
}

export interface RadarScores {
    listening: number;
    speaking: number;
    reading: number;
    writing: number;
}

/** Heuristic 0–100 scores from app activity (not a scientific assessment). */
export function computeRadarScores(c: LifetimeCounters, wordCount: number): RadarScores {
    const listen = Math.min(100, c.readingSessions * 14 + c.srsReviews * 2.5 + wordCount * 0.35);
    const speak = Math.min(100, c.readingSessions * 10 + c.chatMessages * 1.2 + c.srsReviews * 1.5);
    const read = Math.min(100, c.visualLookups * 3.5 + wordCount * 0.55 + c.srsReviews * 0.8);
    const write = Math.min(100, c.chatMessages * 4 + c.wordsAdded * 0.4);
    return {
        listening: Math.round(listen),
        speaking: Math.round(speak),
        reading: Math.round(read),
        writing: Math.round(write),
    };
}

export interface VocabPoint {
    date: string;
    cumulativeEntries: number;
    /** 粗略估算阅读词汇量，用于正向反馈曲线 */
    estimatedLexicon: number;
}

/**
 * Cumulative entries by calendar day from word `addedAt`, then estimated lexicon:
 * 3000 + 18 * (word weight) capped at 5200 for display ceiling in copy.
 */
export function buildVocabularySeries(
    words: { addedAt: number; type: 'word' | 'sentence' }[]
): VocabPoint[] {
    if (words.length === 0) {
        return [{ date: todayKey(), cumulativeEntries: 0, estimatedLexicon: 3000 }];
    }

    const sorted = [...words].sort((a, b) => a.addedAt - b.addedAt);
    const byDay = new Map<string, number>();

    let running = 0;
    for (const w of sorted) {
        const wgt = w.type === 'sentence' ? 0.35 : 1;
        running += wgt;
        const key = toLocalDateKey(w.addedAt);
        byDay.set(key, running);
    }

    const keys = [...byDay.keys()].sort();
    return keys.map((date) => {
        const raw = byDay.get(date)!;
        const cumulativeEntries = Math.round(raw * 10) / 10;
        const estimatedLexicon = Math.min(5200, Math.round(3000 + 18 * raw));
        return { date, cumulativeEntries, estimatedLexicon };
    });
}

export function totalWeightedEntries(words: { type: 'word' | 'sentence' }[]): number {
    return words.reduce((s, w) => s + (w.type === 'sentence' ? 0.35 : 1), 0);
}
