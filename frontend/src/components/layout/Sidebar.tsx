"use client";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Zap, Compass, BookOpen, Sun, Moon, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  // mock user for now
  const user = { display_name: "Ngụy Quang Hùng", role: "Sinh viên" };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.aside 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 268, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="h-full bg-sidebar/95 backdrop-blur-2xl border-r border-sidebar-border/80 flex flex-col shrink-0 z-20 overflow-hidden shadow-sm"
          aria-label="Thanh điều hướng bên"
        >
          {/* Top Brand & Actions */}
          <div className="p-3.5 w-[268px] flex justify-between items-center shrink-0 border-b border-sidebar-border/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Sparkles size={16} className="text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-[14px] leading-tight tracking-tight text-sidebar-foreground">EDU-04</span>
                <span className="text-[10.5px] font-medium text-sidebar-foreground/50">Knowledge Hub</span>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button 
                onClick={onToggle} 
                aria-label="Thu gọn thanh bên"
                title="Thu gọn"
                className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 rounded-lg transition-colors cursor-pointer"
              >
                <Menu size={18} />
              </button>
            </div>
          </div>

          {/* New Chat Action */}
          <div className="p-3 w-[268px] shrink-0">
            <Link 
              href="/" 
              className="w-full flex items-center justify-between bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2.5 rounded-xl shadow-xs transition-all active:scale-[0.98] text-[13.5px] font-semibold no-underline group"
            >
              <span className="flex items-center gap-2.5">
                <div className="w-[20px] h-[20px] rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                  <Zap size={12} className="text-primary-foreground" />
                </div>
                <span>Hội thoại mới</span>
              </span>
              <span className="text-[11px] font-medium opacity-70 group-hover:opacity-100 transition-opacity">⌘K</span>
            </Link>
          </div>

          {/* Main Navigation */}
          <nav className="px-3 py-1 flex flex-col gap-1 w-[268px] shrink-0">
            <div className="px-3 py-1.5 text-[10.5px] font-semibold text-sidebar-foreground/45 uppercase tracking-wider">
              Khám phá
            </div>
            <Link 
              href="/library" 
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all no-underline ${
                pathname === '/library' 
                  ? 'bg-sidebar-accent text-sidebar-foreground font-semibold shadow-xs' 
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              <Compass size={17} className={pathname === '/library' ? 'text-primary' : ''} /> 
              <span>Thư viện tài liệu</span>
            </Link>
            <Link 
              href="/learning" 
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all no-underline ${
                pathname === '/learning' 
                  ? 'bg-sidebar-accent text-sidebar-foreground font-semibold shadow-xs' 
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              <BookOpen size={17} className={pathname === '/learning' ? 'text-primary' : ''} /> 
              <span>Học tập & Ôn luyện</span>
            </Link>
          </nav>

          <div className="flex-1 overflow-y-auto px-3 py-2 w-[268px]">
             {/* Space for dynamic history or quick tags */}
          </div>

          {/* User profile & Settings */}
          <div className="p-3 border-t border-sidebar-border/60 mt-auto flex items-center justify-between shrink-0 bg-sidebar/50 backdrop-blur-md">
            <Link href="/profile" className="flex items-center gap-2.5 rounded-xl p-1.5 -ml-1 hover:bg-sidebar-accent/70 transition-colors no-underline min-w-0 flex-1">
               <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 shrink-0 flex items-center justify-center text-primary text-xs font-bold">
                 {user.display_name.charAt(0)}
               </div>
               <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold text-sidebar-foreground truncate max-w-[120px]">
                    {user.display_name}
                  </span>
                  <span className="text-[11px] text-sidebar-foreground/50">
                    {user.role}
                  </span>
               </div>
            </Link>
            {mounted && (
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
                className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 rounded-xl transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
