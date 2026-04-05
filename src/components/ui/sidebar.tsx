import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelLeft } from 'lucide-react';

const SidebarContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
} | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
}

export const SidebarProvider = ({ children, defaultOpen = true }: { children: React.ReactNode, defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <SidebarContext.Provider value={{ open, setOpen, isMobile }}>
      <div className="flex min-h-screen w-full bg-stitch-surface">{children}</div>
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const { open, isMobile } = useSidebar();
  
  if (isMobile && !open) return null;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-[100] flex h-[100dvh] min-h-0 w-[min(16rem,88vw)] shrink-0 flex-col border-r transition-transform duration-300 md:w-64",
        "border-white/60 bg-white/78 shadow-xl shadow-slate-900/8 backdrop-blur-xl backdrop-saturate-150 md:translate-x-0 md:shadow-none",
        isMobile && !open && "-translate-x-full",
        className
      )}
    >
      {children}
    </aside>
  );
};

export const SidebarInset = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    const { open, isMobile, setOpen } = useSidebar();
    return (
        <div className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 md:ml-64", className)}>
            {isMobile && open && (
                <button
                    type="button"
                    aria-label="关闭菜单"
                    className="fixed inset-0 z-[90] cursor-default border-0 bg-slate-900/35 p-0 backdrop-blur-md backdrop-saturate-150"
                    onClick={() => setOpen(false)}
                />
            )}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>
    );
};

export const SidebarTrigger = ({ className }: { className?: string }) => {
  const { open, setOpen } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 md:hidden", className)} // Only show on mobile by default
      onClick={() => setOpen(!open)}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
};

export const SidebarHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex h-14 shrink-0 items-center border-b border-slate-200/20 px-4 lg:h-16", className)}>{children}</div>
);
export const SidebarContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4", className)}>{children}</div>
);
export const SidebarFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("mt-auto shrink-0 border-t border-slate-200/20 p-4", className)}>{children}</div>
);
export const SidebarMenu = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <ul className={cn('flex flex-col gap-1', className)}>{children}</ul>
);
export const SidebarMenuItem = ({ children }: { children: React.ReactNode }) => <li>{children}</li>;
export const SidebarMenuButton = ({ children, className, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold leading-none text-slate-600 transition-all duration-200 hover:translate-x-0.5 hover:text-stitch-primary",
        active && "bg-white text-blue-700 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:text-blue-300",
        className
      )}
      {...props}
    >
      {children}
    </button>
);
