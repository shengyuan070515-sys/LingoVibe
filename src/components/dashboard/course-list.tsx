import * as React from "react"
import { 
  Briefcase, 
  Mic, 
  Book, 
  Globe, 
  Star, 
  Play, 
  Clock,
  LayoutGrid,
  List
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

interface Course {
  id: string
  title: string
  description: string
  progress: number
  totalLessons: number
  completedLessons: number
  estimatedTime: string
  icon: string
}

interface CourseListProps {
  courses: Course[]
}

export function CourseList({ courses: initialCourses }: CourseListProps) {
  const [courses] = React.useState<Course[]>(initialCourses)
  const [favorites, setFavorites] = React.useState<Set<string>>(new Set(["1", "3"]))
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid")
  const { toast } = useToast()

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        toast("已从收藏中移除", "default")
      } else {
        next.add(id)
        toast("已成功收藏", "success")
      }
      return next
    })
  }

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "briefcase": return <Briefcase className="h-5 w-5" />
      case "mic": return <Mic className="h-5 w-5" />
      case "book": return <Book className="h-5 w-5" />
      case "globe": return <Globe className="h-5 w-5" />
      default: return <Book className="h-5 w-5" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">推荐课程</h2>
        <div className="flex w-fit items-center gap-2 rounded-lg bg-gray-100 p-1">
          <Button 
            variant={viewMode === "grid" ? "default" : "ghost"} 
            size="sm" 
            className="px-2"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button 
            variant={viewMode === "list" ? "default" : "ghost"} 
            size="sm" 
            className="px-2"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={cn(
        "grid gap-6",
        viewMode === "grid" ? "md:grid-cols-2" : "grid-cols-1"
      )}>
        {courses.map((course) => {
          const isFavorite = favorites.has(course.id)
          return (
            <Card key={course.id} className="group hover:border-blue-200 transition-all overflow-hidden">
              <CardContent className="p-0">
                <div className={cn(
                  "flex",
                  viewMode === "grid" ? "flex-col" : "flex-row"
                )}>
                  {/* 图标区域 */}
                  <div className={cn(
                    "bg-blue-50 flex items-center justify-center text-blue-600 transition-colors group-hover:bg-blue-100",
                    viewMode === "grid" ? "h-32 w-full" : "h-auto w-32 shrink-0"
                  )}>
                    {React.cloneElement(getIcon(course.icon) as React.ReactElement, { 
                      className: "h-10 w-10" 
                    })}
                  </div>

                  {/* 内容区域 */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                          {course.title}
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8 rounded-full",
                            isFavorite ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                          )}
                          onClick={(e) => {
                            e.preventDefault()
                            toggleFavorite(course.id)
                          }}
                        >
                          <Star className="h-5 w-5" />
                        </Button>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                        {course.description}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>预计耗时: {course.estimatedTime}</span>
                        </div>
                        <span>{course.completedLessons}/{course.totalLessons} 课时</span>
                      </div>
                      <Progress value={course.progress} className="h-1.5" />
                      
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs font-medium text-blue-600">
                          {course.progress}% 已完成
                        </span>
                        <Button size="sm" className="gap-1 rounded-full px-4">
                          <Play className="h-3 w-3 fill-current" />
                          继续学习
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 我的收藏列表 (用于验证同步移除功能) */}
      {favorites.size > 0 && (
        <div className="mt-12 pt-8 border-t">
          <div className="flex items-center gap-2 mb-6">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900">我的收藏</h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {favorites.size}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {courses.filter(c => favorites.has(c.id)).map(course => (
              <div key={course.id} className="flex items-center gap-3 p-3 bg-white border rounded-lg shadow-sm">
                <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded flex items-center justify-center shrink-0">
                  {getIcon(course.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{course.title}</p>
                  <p className="text-xs text-gray-400">{course.progress}% 完成</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-300 hover:text-red-500"
                  onClick={() => toggleFavorite(course.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
