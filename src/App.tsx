import * as React from "react"
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { ToastProvider } from "@/components/ui/toast"

import { DashboardPage } from "@/pages/Dashboard"
import { AiChatPage } from "@/pages/AiChat"
import { CoursesPage } from "@/pages/Courses"
import { WordBankPage } from "@/pages/WordBank"
import { SettingsPage } from "@/pages/Settings"
import { VisualDictionaryPage } from "@/pages/VisualDictionary"
import { DailyPodcastPage } from "@/pages/DailyPodcast"
import { LearningStatsPage } from "@/pages/LearningStats"
import { AchievementsPage } from "@/pages/Achievements"

export type Page = 'dashboard' | 'ai-chat' | 'courses' | 'wordbank' | 'achievements' | 'stats' | 'community' | 'settings' | 'visual-dictionary' | 'daily-podcast';

const pageTitles: Record<Page, string> = {
  dashboard: '首页',
  'ai-chat': 'AI Chat',
  courses: 'My Courses',
  wordbank: 'Word Bank',
  achievements: 'Achievements',
  stats: 'Learning Stats',
  community: 'Community',
  settings: 'Settings',
  'visual-dictionary': 'Visual Dictionary',
  'daily-podcast': 'Daily Context Pod',
};

function App() { 
  const [activePage, setActivePage] = React.useState<Page>('dashboard');

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActivePage} />;
      case 'ai-chat':
        return <AiChatPage />;
      case 'courses':
        return <CoursesPage />;
      case 'wordbank':
        return <WordBankPage />;
      case 'settings':
        return <SettingsPage />;
      case 'visual-dictionary':
        return <VisualDictionaryPage />;
      case 'daily-podcast':
        return <DailyPodcastPage onNavigateToSettings={() => setActivePage('settings')} />;
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
          <div className="flex min-h-0 flex-1 flex-col min-w-0">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4 sm:px-6 lg:h-16 sticky top-0 z-30 shadow-sm"> 
              <SidebarTrigger className="-ml-1 shrink-0 md:hidden" /> 
              <div className="hidden min-w-0 md:block">
                <span className="text-sm font-medium text-muted-foreground"> 
                  {pageTitles[activePage]}
                </span> 
              </div>
              <span className="min-w-0 truncate text-sm font-semibold text-gray-800 md:hidden">
                LingoVibe
              </span>
              
              <div className="flex-1" />
              
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">VIP 会员</span>
                <Separator orientation="vertical" className="h-6 mx-1 hidden sm:mx-2 sm:block" />
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                  XM
                </div>
              </div>
            </header> 
            
            <main className="flex-1 overflow-auto bg-gray-50/50 p-4 sm:p-6 md:p-8"> 
              {renderPage()}
            </main> 
          </div>
        </SidebarInset>
      </SidebarProvider> 
    </ToastProvider>
  ) 
}

export default App;
