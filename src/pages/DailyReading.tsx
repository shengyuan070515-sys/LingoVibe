import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DailyReadingPageProps {
  onNavigateToSettings?: () => void;
}

export function DailyReadingPage({ onNavigateToSettings }: DailyReadingPageProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-lg flex-col gap-4")}>
      <h1 className="text-xl font-semibold tracking-tight text-slate-800">每日阅读</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        完整文章列表、搜索与导入等功能将在下一版迭代中提供。
      </p>
      {onNavigateToSettings ? (
        <Button type="button" variant="outline" className="w-fit" onClick={onNavigateToSettings}>
          去设置
        </Button>
      ) : null}
    </div>
  );
}
