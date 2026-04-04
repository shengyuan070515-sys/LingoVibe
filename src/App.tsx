import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Settings } from "lucide-react"
import { seedDemoDataIfEmpty } from "@/lib/mockData"
import { clearLegacyPodcastStorage } from "@/lib/migrations/clear-legacy-podcast-storage"
import { useWordBankStore } from "@/store/wordBankStore"
import { usePodcastStore } from "@/store/podcastStore"
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
import { DailyPodcastPage } from "@/pages/DailyPodcast"
import { FlashcardReviewPage } from "@/pages/FlashcardReview"
import { LearningStatsPage } from "@/pages/LearningStats"
import { AchievementsPage } from "@/pages/Achievements"

export type Page = 'dashboard' | 'ai-chat' | 'courses' | 'wordbank' | 'achievements' | 'stats' | 'community' | 'settings' | 'visual-dictionary' | 'daily-podcast' | 'flashcard-review';

const pageTitles: Record<Page, string> = {
  dashboard: '首页',
  'ai-chat': 'AI 对话',
  courses: '我的课程',
  wordbank: '我的生词本',
  achievements: '成就与奖励',
  stats: '学习统计',
  community: '社区交流',
  settings: '设置',
  'visual-dictionary': '视觉查词',
  'daily-podcast': '每日播客',
  'flashcard-review': '闪卡复习',
};

function App() { 
  const [activePage, setActivePage] = React.useState<Page>('dashboard');

  React.useEffect(() => {
    clearLegacyPodcastStorage();
    const run = () => seedDemoDataIfEmpty();
    run();
    const u1 = useWordBankStore.persist.onFinishHydration(run);
    const u2 = usePodcastStore.persist.onFinishHydration(run);
    return () => {
      u1();
      u2();
    };
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActivePage} />;
      case 'ai-chat':
        return <AiChatPage />;
      case 'courses':
        return <CoursesPage />;
      case 'wordbank':
        return <WordBankPage onNavigate={setActivePage} />;
      case 'settings':
        return <SettingsPage />;
      case 'visual-dictionary':
        return <VisualDictionaryPage />;
      case 'daily-podcast':
        return <DailyPodcastPage onNavigateToSettings={() => setActivePage('settings')} />;
      case 'flashcard-review':
        return <FlashcardReviewPage onNavigate={setActivePage} />;
      case 'stats':
        return <LearningStatsPage />;
      case 'achievements':
        return <AchievementsPage />;
      default:
        return <DashboardPage onNavigate={setActivePage} />;
    }
  }

  return ( 
    <ToastProvider>
      <SidebarProvider defaultOpen={false}> 
        <AppSidebar activePage={activePage} setActivePage={setActivePage} /> 
        <SidebarInset>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="relative sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-100/90 bg-white/95 px-3 shadow-sm backdrop-blur-md sm:gap-3 sm:px-6 lg:h-16"> 
              <SidebarTrigger className="-ml-0.5 shrink-0 md:-ml-1" /> 
              <div className="hidden min-w-0 md:block">
                <span className="text-sm font-medium text-muted-foreground"> 
                  {pageTitles[activePage]}
                </span> 
              </div>
              <span className="pointer-events-none absolute left-1/2 top-1/2 max-w-[42%] -translate-x-1/2 -translate-y-1/2 truncate text-center text-sm font-semibold text-slate-800 md:hidden">
                {pageTitles[activePage]}
              </span>
              
              <div className="hidden flex-1 md:block" />
              
              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-slate-500 hover:bg-teal-50 hover:text-teal-700 md:hidden"
                  onClick={() => setActivePage('settings')}
                  aria-label="设置"
                >
                  <Settings className="h-5 w-5" strokeWidth={1.75} />
                </Button>
                <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded-full sm:text-xs">VIP 会员</span>
                <Separator orientation="vertical" className="mx-0.5 hidden h-6 sm:mx-2 sm:block" />
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  XM
                </div>
              </div>
            </header> 
            
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/35">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePage}
                  role="presentation"
                  initial={{ opacity: 0, scale: 0.987 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.982 }}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-0 flex-1 flex-col overflow-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:p-6 md:pb-8 md:p-8"
                >
                  {renderPage()}
                </motion.div>
              </AnimatePresence>
            </main>

            <MobileTabBar activePage={activePage} onNavigate={setActivePage} />
          </div>
        </SidebarInset>
      </SidebarProvider> 
    </ToastProvider>
  ) 
}

export default App;
