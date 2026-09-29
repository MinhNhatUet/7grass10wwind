"use client";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Zap, User, Compass, BookOpen, ShieldCheck, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // mock user for now
  const user = { display_name: "Ngụy Quang Hùng", role: "student" };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.aside 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="h-full bg-sidebar/95 backdrop-blur-2xl border-r border-sidebar-border flex flex-col shrink-0 z-20 overflow-visible"
        >
          <div className="p-3 w-[260px] flex justify-between items-center shrink-0">
            <button onClick={onToggle} className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground bg-transparent border-0 cursor-pointer rounded-lg hover:bg-sidebar-accent transition-colors">
              <Menu size={20} />
            </button>
            <Link href="/profile" className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground bg-transparent border-0 cursor-pointer rounded-lg hover:bg-sidebar-accent transition-colors">
              <User size={20} />
            </Link>
          </div>

          <div className="px-3 pb-3 w-[260px] shrink-0">
            <Link href="/" className="w-full flex items-center justify-between bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border text-sidebar-foreground px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-[14px] font-medium no-underline">
              <span className="flex items-center gap-2">
                <div className="w-[20px] h-[20px] rounded-full bg-primary flex items-center justify-center shadow-sm">
                  <Zap size={12} className="text-primary-foreground" />
                </div>
                Chat mới
              </span>
            </Link>
          </div>

          <div className="px-3 py-1 flex flex-col gap-1 w-[260px] shrink-0">
            <Link href="/library" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors no-underline ${pathname === '/library' ? 'bg-sidebar-accent text-sidebar-foreground font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'}`}>
              <Compass size={18} /> Thư viện tài liệu
            </Link>
            <Link href="/learning" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors no-underline ${pathname === '/learning' ? 'bg-sidebar-accent text-sidebar-foreground font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'}`}>
              <BookOpen size={18} /> Học tập
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 w-[260px]">
             {/* History list could go here */}
          </div>

          <div className="p-3 border-t border-sidebar-border mt-auto flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 rounded-lg overflow-hidden">
               <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center text-primary-foreground text-xs font-medium">
                 {user.display_name.charAt(0)}
               </div>
               <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[120px]">
                    {user.display_name}
                  </span>
                  <span className="text-[11px] text-sidebar-foreground/60 capitalize">
                    {user.role}
                  </span>
               </div>
            </div>
            {mounted && (
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg border-0 cursor-pointer bg-transparent transition-colors"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
