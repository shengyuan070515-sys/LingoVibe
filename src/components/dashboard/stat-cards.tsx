import { Target, TrendingUp, Zap, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useWordBankStore } from "@/store/wordBankStore"
import { useLearningAnalyticsStore } from "@/store/learningAnalyticsStore"
import * as React from "react"
import {
    computeLearningStreak,
    todayKey,
    totalWeightedEntries,
} from "@/lib/learning-analytics"

export function StatCards() {
    const words = useWordBankStore((s) => s.words)
    const dailyActivity = useLearningAnalyticsStore((s) => s.dailyActivity)
    const backfillActivityFromWords = useLearningAnalyticsStore((s) => s.backfillActivityFromWords)

    React.useEffect(() => {
        backfillActivityFromWords(words.map((w) => ({ addedAt: w.addedAt })))
    }, [words, backfillActivityFromWords])

    const streak = React.useMemo(() => computeLearningStreak(dailyActivity), [dailyActivity])
    const today = todayKey()
    const todayScore = dailyActivity[today] ?? 0
    const dailyTotal = 5
    const dailyCompleted = Math.min(dailyTotal, Math.floor(todayScore / 4))
    const goalProgress = (dailyCompleted / dailyTotal) * 100

    const weighted = totalWeightedEntries(words)
    const estimatedLex = words.length === 0 ? 3000 : Math.min(5200, Math.round(3000 + 18 * weighted))

    const last7 = React.useMemo(() => {
        const out: number[] = []
        const end = new Date()
        end.setHours(0, 0, 0, 0)
        for (let i = 6; i >= 0; i--) {
            const d = new Date(end)
            d.setDate(d.getDate() - i)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, "0")
            const day = String(d.getDate()).padStart(2, "0")
            const key = `${y}-${m}-${day}`
            out.push(dailyActivity[key] ?? 0)
        }
        return out
    }, [dailyActivity])

    const max7 = Math.max(1, ...last7)

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-blue-600 shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">今日目标</CardTitle>
                    <Target className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {dailyCompleted}/{dailyTotal}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        学习活跃度每 +4 点亮 1 格（查词、对话、收录、播客等都会加分）
                    </p>
                    <Progress value={goalProgress} className="mt-3 h-2" />
                </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500 shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">连续学习</CardTitle>
                    <Zap className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{streak} 天</div>
                    <p className="mt-1 text-xs text-muted-foreground">有学习行为的日子会延续连胜</p>
                    <div className="mt-3 flex gap-1">
                        {[...Array(7)].map((_, i) => (
                            <div
                                key={i}
                                className={`h-2 flex-1 rounded-full ${
                                    streak > 0 && i < Math.min(7, streak) ? "bg-orange-500" : "bg-gray-100"
                                }`}
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-600 shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">近 7 日活跃</CardTitle>
                    <BarChart3 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="flex h-12 items-end gap-1">
                        {last7.map((v, i) => (
                            <div
                                key={i}
                                className="w-full rounded-t-sm bg-emerald-400/90 transition-all"
                                style={{ height: `${Math.max(8, (v / max7) * 100)}%` }}
                                title={`${v} 活跃度`}
                            />
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">每日总活跃度（越高柱越长）</p>
                </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-600 shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">估算阅读词汇</CardTitle>
                    <TrendingUp className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold tabular-nums">{estimatedLex.toLocaleString()}</div>
                    <p className="mt-1 text-xs text-muted-foreground">本应用收录 {words.length} 条 · 激励型估算</p>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-600">
                            向 5000 进发
                        </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
