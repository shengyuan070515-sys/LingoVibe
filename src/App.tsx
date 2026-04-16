import * as React from "react"
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Settings } from "lucide-react"
import { seedDemoDataIfEmpty } from "@/lib/mockData"
import { clearLegacyPodcastStorage } from "@/lib/migrations/clear-legacy-podcast-storage"
import { useWordBankStore } from "@/store/wordBankStore"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { ToastProvider } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { MobileTabBar } from "@/components/layout/mobile-tab-bar"

import { DashboardPage } from "@/pages/Dashboard"
import { AiChatPage } from "@/pages/AiChat"
import { CoursesPage } from "@/pages/Courses"
import { WordBankPage } from "@/pages/WordBank"
import { SettingsPage } from "@/pages/Settings"
import { VisualDictionaryPage } from "@/pages/VisualDictionary"
import { DailyReadingPage } from "@/pages/DailyReading"
import { FlashcardReviewPage } from "@/pages/FlashcardReview"
import { LearningStatsPage } from "@/pages/LearningStats"
import { AchievementsPage } from "@/pages/Achievements"

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-800">页面出了点问题</h1>
          <p className="max-w-md text-sm text-slate-600">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
            className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            返回首页
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 路由路径 → 页面标题
const routeTitles: Record<string, string> = {
  '/': '首页',
  '/chat': 'AI 对话',
  '/courses': '我的课程',
  '/wordbank': '我的生词本',
  '/achievements': '成就与奖励',
  '/stats': '学习统计',
  '/settings': '设置',
  '/visual-dictionary': '视觉查词',
  '/reading': '每日阅读',
  '/flashcard': '闪卡复习',
};

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName] = useLocalStorage('lingovibe_display_name', '');

  React.useEffect(() => {
    clearLegacyPodcastStorage();
    const run = () => seedDemoDataIfEmpty();
    run();
    const u1 = useWordBankStore.persist.onFinishHydration(run);
    return () => { u1(); };
  }, []);

  const pageTitle = routeTitles[location.pathname] ?? '首页';

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="relative sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-100/90 bg-white/95 px-3 shadow-sm backdrop-blur-md sm:gap-3 sm:px-6 lg:h-16">
            <SidebarTrigger className="-ml-0.5 shrink-0 md:-ml-1" />
            <div className="hidden min-w-0 md:block">
              <span className="text-sm font-medium text-muted-foreground">
                {pageTitle}
              </span>
            </div>
            <span className="pointer-events-none absolute left-1/2 top-1/2 max-w-[42%] -translate-x-1/2 -translate-y-1/2 truncate text-center text-sm font-semibold text-slate-800 md:hidden">
              {pageTitle}
            </span>

            <div className="hidden flex-1 md:block" />

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-slate-500 hover:bg-teal-50 hover:text-teal-700 md:hidden"
                onClick={() => navigate('/settings')}
                aria-label="设置"
              >
                <Settings className="h-5 w-5" strokeWidth={1.75} />
              </Button>
              <Separator orientation="vertical" className="mx-0.5 hidden h-6 sm:mx-2 sm:block" />
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                {displayName ? displayName.slice(0, 2).toUpperCase() : 'LV'}
              </div>
            </div>
          </header>

          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-stitch-surface">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                role="presentation"
                initial={{ opacity: 0, scale: 0.987 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.982 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-0 flex-1 flex-col overflow-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:p-6 md:pb-8 md:p-8"
              >
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/chat" element={<AiChatPage />} />
                  <Route path="/courses" element={<CoursesPage />} />
                  <Route path="/wordbank" element={<WordBankPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/visual-dictionary" element={<VisualDictionaryPage />} />
                  <Route path="/reading" element={<DailyReadingPage />} />
                  <Route path="/flashcard" element={<FlashcardReviewPage />} />
                  <Route path="/stats" element={<LearningStatsPage />} />
                  <Route path="/achievements" element={<AchievementsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>

          <MobileTabBar />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
