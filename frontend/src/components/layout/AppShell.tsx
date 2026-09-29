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
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden isolate relative">
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <main className="flex-1 flex flex-col relative min-w-0 h-screen overflow-hidden">
        <header className="h-[60px] shrink-0 flex items-center px-4 w-full relative z-10">
          <AnimatePresence>
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer mr-2 rounded-lg hover:bg-secondary absolute left-4 z-10 transition-colors"
              >
                <Menu size={20} />
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
            animate={{ width: 480, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="bg-card/95 backdrop-blur-xl border-l border-border flex flex-col shrink-0 z-20 overflow-hidden"
          >
            {rightPanel}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
