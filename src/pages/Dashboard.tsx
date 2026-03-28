import { WelcomeHeader } from "@/components/dashboard/welcome-header"
import { StatCards } from "@/components/dashboard/stat-cards"
import { CourseList } from "@/components/dashboard/course-list"

// 模拟数据 
const userData = { 
  name: "小明", 
  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix", 
} 

const coursesData = [ 
  { 
    id: "1", 
    title: "职场英语精进", 
    description: "掌握商务沟通、邮件写作和会议用语", 
    progress: 45, 
    totalLessons: 24, 
    completedLessons: 11, 
    estimatedTime: "15 分钟", 
    icon: "briefcase", 
  }, 
  { 
    id: "2", 
    title: "托福口语特训", 
    description: "系统提升口语表达能力，冲刺高分", 
    progress: 30, 
    totalLessons: 30, 
    completedLessons: 9, 
    estimatedTime: "20 分钟", 
    icon: "mic", 
  }, 
  { 
    id: "3", 
    title: "英语语法大师", 
    description: "从基础到进阶，构建完整语法体系", 
    progress: 72, 
    totalLessons: 18, 
    completedLessons: 13, 
    estimatedTime: "10 分钟", 
    icon: "book", 
  }, 
  { 
    id: "4", 
    title: "日常英语会话", 
    description: "地道表达，轻松应对各种生活场景", 
    progress: 15, 
    totalLessons: 20, 
    completedLessons: 3, 
    estimatedTime: "12 分钟", 
    icon: "globe", 
  }, 
] 

export function DashboardPage() {
    return (
        <div className="flex flex-col gap-8"> 
            <WelcomeHeader 
                userName={userData.name} 
                avatarUrl={userData.avatarUrl} 
            /> 
            <StatCards /> 
            <CourseList courses={coursesData} /> 
        </div> 
    )
}
