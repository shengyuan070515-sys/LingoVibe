import * as React from "react"
import { 
  Home, 
  BookOpen, 
  Settings, 
  LogOut, 
  Trophy, 
  MessageSquare, 
  BarChart3,
  Bot,
  Book,
  Image as ImageIcon,
  Layers
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Page } from "@/App"

interface AppSidebarProps {
  activePage: Page;
  setActivePage: (page: Page) => void;
}

export function AppSidebar({ activePage, setActivePage }: AppSidebarProps) {
  const { isMobile, setOpen } = useSidebar();

  const navigate = (id: Page) => {
    setActivePage(id);
    if (isMobile) setOpen(false);
  };

  const menuItems: { id: Page; icon: React.ElementType; label: string }[] = [
    { id: 'dashboard', icon: Home, label: '首页' },
    { id: 'flashcard-review', icon: Layers, label: '闪卡复习' },
    { id: 'ai-chat', icon: Bot, label: 'AI 对话' },
    { id: 'visual-dictionary', icon: ImageIcon, label: '视觉查词' },
    { id: 'daily-reading', icon: BookOpen, label: '每日阅读' },
    { id: 'courses', icon: BookOpen, label: '我的课程' },
    { id: 'wordbank', icon: Book, label: '📚 我的生词本' },
    { id: 'achievements', icon: Trophy, label: '成就与奖励' },
    { id: 'stats', icon: BarChart3, label: '学习统计' },
    { id: 'community', icon: MessageSquare, label: '社区交流' },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
            LV
          </div>
          <span className="text-xl font-bold tracking-tight text-blue-600">LingoVibe</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map(item => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton 
                active={activePage === item.id}
                onClick={() => navigate(item.id)}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          {!isMobile && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              active={activePage === 'settings'}
              onClick={() => navigate('settings')}
            >
              <Settings className="h-4 w-4" />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton className="text-red-500 hover:bg-red-50 hover:text-red-600">
              <LogOut className="h-4 w-4" />
              <span>退出登录</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
