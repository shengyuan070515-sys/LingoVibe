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
              "pointer-events-auto flex min-w-[300px] items-center justify-between gap-4 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-lg shadow-slate-900/10 backdrop-blur-xl backdrop-saturate-150 animate-in slide-in-from-top-4 fade-in duration-300",
              t.type === "default" && "border-white/70 bg-white/82 text-slate-800",
              t.type === "success" && "border-emerald-200/60 bg-emerald-50/85 text-emerald-900",
              t.type === "error" && "border-red-200/60 bg-red-50/85 text-red-900"
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
