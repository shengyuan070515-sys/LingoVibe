import * as React from 'react';
import { buildHeatmapGrid, heatmapFill } from '@/lib/learning-analytics';
import { cn } from '@/lib/utils';

interface ActivityHeatmapProps {
    dailyActivity: Record<string, number>;
    weeks?: number;
    className?: string;
}

export function ActivityHeatmap({ dailyActivity, weeks = 14, className }: ActivityHeatmapProps) {
    const { grid } = React.useMemo(() => buildHeatmapGrid(dailyActivity, weeks), [dailyActivity, weeks]);

    const [tip, setTip] = React.useState<{ x: number; y: number; date: string; count: number } | null>(null);

    return (
        <div className={cn('relative w-full overflow-x-auto', className)}>
            <div className="flex min-w-0 flex-col gap-1 pb-1">
                <p className="pl-8 text-[10px] text-muted-foreground">近 {weeks} 周 · 每日学习活跃度</p>
                <div className="flex gap-1">
                    <div className="flex w-7 shrink-0 flex-col justify-between py-0.5 text-[9px] leading-none text-muted-foreground">
                        <span>日</span>
                        <span>六</span>
                    </div>
                    <div
                        className="grid flex-1 gap-1"
                        style={{
                            gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
                            gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
                        }}
                    >
                        {grid.map((row, dow) =>
                            row.map((cell, w) => {
                                if (!cell) {
                                    return (
                                        <div
                                            key={`e-${dow}-${w}`}
                                            className="aspect-square min-h-[10px] max-h-4 rounded-sm bg-muted/30"
                                        />
                                    );
                                }
                                return (
                                    <button
                                        key={cell.date}
                                        type="button"
                                        title={`${cell.date} · 活跃度 ${cell.count}`}
                                        className="aspect-square min-h-[10px] max-h-4 cursor-pointer rounded-sm border border-transparent outline-none transition hover:ring-2 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
                                        style={{ backgroundColor: heatmapFill(cell.level) }}
                                        onMouseEnter={(e) => {
                                            const r = e.currentTarget.getBoundingClientRect();
                                            setTip({
                                                x: r.left + r.width / 2,
                                                y: r.top,
                                                date: cell.date,
                                                count: cell.count,
                                            });
                                        }}
                                        onMouseLeave={() => setTip(null)}
                                        onFocus={() => {}}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-8 pt-2 text-[11px] text-muted-foreground">
                    <span>更少</span>
                    <div className="flex gap-1">
                        {([0, 1, 2, 3, 4] as const).map((lv) => (
                            <div
                                key={lv}
                                className="h-3 w-3 rounded-sm"
                                style={{ backgroundColor: heatmapFill(lv) }}
                            />
                        ))}
                    </div>
                    <span>更多</span>
                </div>
            </div>
            {tip && (
                <div
                    className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
                    style={{ left: tip.x, top: tip.y - 6 }}
                >
                    <div className="font-medium">{tip.date}</div>
                    <div className="text-muted-foreground">学习活跃度 {tip.count}</div>
                </div>
            )}
        </div>
    );
}
