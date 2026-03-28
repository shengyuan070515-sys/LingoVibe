import type { RadarScores } from '@/lib/learning-analytics';
import { cn } from '@/lib/utils';

interface MasteryRadarChartProps {
    scores: RadarScores;
    className?: string;
}

const LABELS: { key: keyof RadarScores; label: string; angle: number }[] = [
    { key: 'listening', label: '听', angle: -90 },
    { key: 'speaking', label: '说', angle: 0 },
    { key: 'reading', label: '读', angle: 90 },
    { key: 'writing', label: '写', angle: 180 },
];

function polar(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function MasteryRadarChart({ scores, className }: MasteryRadarChartProps) {
    const cx = 120;
    const cy = 120;
    const R = 88;

    const rings = [0.25, 0.5, 0.75, 1];
    const pts = LABELS.map(({ key, angle }) => polar(cx, cy, (R * scores[key]) / 100, angle));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

    return (
        <div className={cn('flex flex-col items-center gap-4', className)}>
            <svg viewBox="0 0 240 240" className="h-64 w-64 max-w-full">
                {rings.map((t) => {
                    const ringPts = LABELS.map(({ angle }) => polar(cx, cy, R * t, angle));
                    const ringD = ringPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
                    return (
                        <path
                            key={t}
                            d={ringD}
                            fill="none"
                            stroke="currentColor"
                            className="text-border"
                            strokeWidth="1"
                            opacity={0.5}
                        />
                    );
                })}
                {LABELS.map(({ label, angle }) => {
                    const outer = polar(cx, cy, R + 18, angle);
                    const inner = polar(cx, cy, R, angle);
                    return (
                        <g key={label}>
                            <line
                                x1={cx}
                                y1={cy}
                                x2={inner.x}
                                y2={inner.y}
                                stroke="currentColor"
                                className="text-border"
                                strokeWidth="1"
                                opacity={0.6}
                            />
                            <text
                                x={outer.x}
                                y={outer.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="fill-foreground text-sm font-bold"
                            >
                                {label}
                            </text>
                        </g>
                    );
                })}
                <path
                    d={d}
                    fill="rgb(99 102 241)"
                    fillOpacity="0.22"
                    stroke="rgb(99 102 241)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                />
                {LABELS.map(({ key, angle }) => {
                    const p = polar(cx, cy, (R * scores[key]) / 100, angle);
                    return (
                        <g key={key}>
                            <circle cx={p.x} cy={p.y} r="4" fill="rgb(99 102 241)" stroke="white" strokeWidth="1.5" />
                            <title>
                                {key}: {scores[key]}
                            </title>
                        </g>
                    );
                })}
            </svg>
            <div className="grid w-full max-w-sm grid-cols-2 gap-2 text-xs">
                {LABELS.map(({ key, label }) => (
                    <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                    >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-semibold text-indigo-600">{scores[key]}</span>
                    </div>
                ))}
            </div>
            <p className="max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
                分数由你在 LingoVibe 内的行为估算（播客、查词、对话、复习等），用于激励坚持，并非标准化语言测评。
            </p>
        </div>
    );
}
