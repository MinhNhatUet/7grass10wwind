"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Menu } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
}

export function AppShell({ children, rightPanel }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden isolate relative bg-mesh-radial">
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <main className="flex-1 flex flex-col relative min-w-0 h-screen overflow-hidden">
        <header className="h-[54px] shrink-0 flex items-center px-4 w-full relative z-10 pointer-events-none">
          <AnimatePresence>
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: -10 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Mở thanh điều hướng"
                title="Mở thanh điều hướng (Sidebar)"
                className="pointer-events-auto p-2 text-muted-foreground hover:text-foreground glass-panel shadow-xs cursor-pointer rounded-xl hover:bg-secondary/70 absolute left-4 z-10 transition-all active:scale-95 flex items-center gap-2"
              >
                <Menu size={18} />
                <span className="text-xs font-semibold pr-1 hidden sm:inline">Menu</span>
              </motion.button>
            )}
          </AnimatePresence>
        </header>

        <div className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
          {children}
        </div>
      </main>

      <AnimatePresence>
        {rightPanel && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 500, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            className="glass-panel border-l border-border flex flex-col shrink-0 z-30 overflow-hidden shadow-2xl max-w-full sm:max-w-[500px]"
            aria-label="Khung chi tiết bên phải"
          >
            {rightPanel}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
