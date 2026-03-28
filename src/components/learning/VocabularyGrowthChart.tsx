import * as React from 'react';
import { buildVocabularySeries, todayKey, type VocabPoint } from '@/lib/learning-analytics';
import { cn } from '@/lib/utils';

interface VocabularyGrowthChartProps {
    words: { addedAt: number; type: 'word' | 'sentence' }[];
    className?: string;
}

const GOAL = 5000;
const BASE = 3000;

export function VocabularyGrowthChart({ words, className }: VocabularyGrowthChartProps) {
    const series = React.useMemo(() => {
        const raw = buildVocabularySeries(words);
        if (raw.length === 0) {
            return [{ date: todayKey(), cumulativeEntries: 0, estimatedLexicon: BASE } satisfies VocabPoint];
        }
        return raw;
    }, [words]);

    const layout = React.useMemo(() => {
        const n = series.length;
        const padL = 44;
        const padR = 16;
        const padT = 12;
        const padB = 28;
        const W = 560;
        const H = 220;
        const innerW = W - padL - padR;
        const innerH = H - padT - padB;

        const ys = series.map((p) => p.estimatedLexicon);
        const minY = Math.min(BASE - 80, ...ys) - 20;
        const maxY = Math.max(GOAL + 80, ...ys, BASE + 50);
        const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
        const yAt = (v: number) => padT + innerH - (innerH * (v - minY)) / (maxY - minY);

        const points = series.map((p, i) => ({ x: xAt(i), y: yAt(p.estimatedLexicon), ...p }));
        const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const areaD = `${lineD} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
        const goalY = yAt(GOAL);

        return { pathD: lineD, areaD, points, goalY, W, H };
    }, [series]);

    const [hover, setHover] = React.useState<(typeof layout.points)[0] | null>(null);

    return (
        <div className={cn('relative w-full', className)}>
            <svg
                viewBox={`0 0 ${layout.W} ${layout.H}`}
                className="h-auto w-full max-h-[280px] text-primary"
                preserveAspectRatio="xMidYMid meet"
            >
                <defs>
                    <linearGradient id="vocabFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <line
                    x1="44"
                    y1={layout.goalY}
                    x2="544"
                    y2={layout.goalY}
                    stroke="currentColor"
                    strokeOpacity="0.2"
                    strokeDasharray="6 4"
                />
                <text x="48" y={layout.goalY - 4} className="fill-muted-foreground" style={{ fontSize: 9 }}>
                    目标 {GOAL}
                </text>
                <path d={layout.areaD} fill="url(#vocabFill)" />
                <path
                    d={layout.pathD}
                    fill="none"
                    stroke="rgb(99 102 241)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {layout.points.map((p, i) => (
                    <circle
                        key={`${p.date}-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r="5"
                        fill="rgb(99 102 241)"
                        stroke="white"
                        strokeWidth="2"
                        className="cursor-pointer"
                        onMouseEnter={() => setHover(p)}
                        onMouseLeave={() => setHover(null)}
                    />
                ))}
            </svg>
            {hover && (
                <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
                    <div className="font-semibold">{hover.date}</div>
                    <div className="text-muted-foreground">
                        估算阅读词汇量{' '}
                        <span className="font-mono font-bold text-indigo-600">{hover.estimatedLexicon}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">收录加权 {hover.cumulativeEntries}</div>
                </div>
            )}
        </div>
    );
}
