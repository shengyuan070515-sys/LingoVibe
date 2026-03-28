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
      <div className="flex min-h-screen w-full bg-gray-50">{children}</div>
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const { open, isMobile } = useSidebar();
  
  if (isMobile && !open) return null;

  return (
    <aside
      className={cn(
        // 移动端抽屉在遮罩之上；桌面 sticky
        "fixed inset-y-0 left-0 z-[100] flex h-[100dvh] min-h-0 w-[min(16rem,88vw)] shrink-0 flex-col border-r bg-white shadow-xl transition-transform duration-300 md:w-64 md:shadow-none",
        "md:sticky md:top-0 md:self-start md:translate-x-0",
        !open && "-translate-x-full",
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
        <div className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300", className)}>
            {isMobile && open && (
                <button
                    type="button"
                    aria-label="关闭菜单"
                    className="fixed inset-0 z-[90] cursor-default border-0 bg-black/45 p-0 backdrop-blur-[1px]"
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

export const SidebarHeader = ({ children, className }: { children: React.ReactNode, className?: string }) => <div className={cn("flex h-14 items-center border-b px-4 lg:h-16", className)}>{children}</div>;
export const SidebarContent = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4", className)}>{children}</div>
);
export const SidebarFooter = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("mt-auto shrink-0 border-t bg-white p-4", className)}>{children}</div>
);
export const SidebarMenu = ({ children }: { children: React.ReactNode }) => <ul className="flex flex-col gap-1">{children}</ul>;
export const SidebarMenuItem = ({ children }: { children: React.ReactNode }) => <li>{children}</li>;
export const SidebarMenuButton = ({ children, className, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium leading-none transition-colors hover:bg-gray-100",
        active && "bg-gray-100 text-gray-900",
        className
      )}
      {...props}
    >
      {children}
    </button>
);
