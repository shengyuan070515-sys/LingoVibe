import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface Toast {
  id: string
  message: string
  type?: "default" | "success" | "error"
}

const ToastContext = React.createContext<{
  toast: (message: string, type?: Toast["type"]) => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const toast = React.useCallback((message: string, type: Toast["type"] = "default") => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 w-full max-w-[400px] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex min-w-[300px] items-center justify-between gap-4 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-2xl border animate-in slide-in-from-top-4 fade-in duration-300",
              t.type === "default" && "bg-white text-gray-900 border-gray-200",
              t.type === "success" && "bg-green-50 text-green-800 border-green-100",
              t.type === "error" && "bg-red-50 text-red-800 border-red-100"
            )}
          >
            <span className="flex-1">{t.message}</span>
            <button 
              onClick={() => removeToast(t.id)}
              className="p-1 rounded-md hover:bg-black/5 transition-colors"
            >
              <X className="h-4 w-4 opacity-50 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error("useToast must be used within a ToastProvider")
  return context
}
