import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface WelcomeHeaderProps {
  userName: string
  avatarUrl?: string
}

export function WelcomeHeader({ userName, avatarUrl }: WelcomeHeaderProps) {
  const hour = new Date().getHours()
  let greeting = "早安"
  if (hour >= 12 && hour < 18) greeting = "午安"
  if (hour >= 18) greeting = "晚安"

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 border-4 border-blue-50 shadow-sm">
          <AvatarImage src={avatarUrl} alt={userName} />
          <AvatarFallback className="bg-blue-600 text-white text-xl font-bold">
            {userName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            {greeting}，{userName}！👋
          </h1>
          <p className="text-gray-500 mt-1">
            今天也是充满活力的一天，让我们继续学习吧。
          </p>
        </div>
      </div>
      
      <div className="hidden md:flex flex-col items-end">
        <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100">
          连续打卡第 12 天
        </div>
        <p className="text-xs text-gray-400 mt-2 italic">
          坚持就是胜利！🚀
        </p>
      </div>
    </div>
  )
}
