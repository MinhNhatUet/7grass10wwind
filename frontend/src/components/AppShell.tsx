"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { CourseItem, MeResponse } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/messages";

interface Props {
  profile: MeResponse | null;
  courses: CourseItem[] | null;
  courseId?: string | null;
  onCourseChange?: (id: string) => void;
  onSignOut: () => void;
  side?: ReactNode;
  onNewChat?: () => void;
  children: ReactNode;
}

const ICON: Record<string, string> = {
  chat: "M4 5h16v11H8l-4 4z",
  library: "M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0zM12 5.5V19",
  docs: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  review: "M5 12l4 4 10-10",
  chart: "M5 19V9M12 19V5M19 19v-7",
  admin: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z",
  plus: "M12 5v14M5 12h14",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  menu: "M4 7h16M4 12h16M4 17h16",
};

export function Icon({ name, size = 18 }: { name: keyof typeof ICON; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}

type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("edu04.theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppShell({ profile, courses, courseId, onCourseChange, onSignOut, side, onNewChat, children }: Props) {
  const role = profile?.user.role;
  const course = courses?.find((c) => c.id === courseId);
  const canManage = courses?.some((c) => c.can_upload || c.can_review);
  const q = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("edu04.theme", next);
    } catch {}
  }

  const name = profile?.user.display_name ?? "";
  const initials = (name || "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans bg-mesh-radial">
      
      {/* SIDEBAR */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-[268px] bg-sidebar/95 backdrop-blur-2xl border-r border-sidebar-border/80 flex flex-col transition-transform duration-300 md:translate-x-0 ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"} md:static`} 
        aria-label="Điều hướng hệ thống"
      >
        <div className="p-4 flex items-center justify-between shrink-0 border-b border-sidebar-border/40">
          <Link href={role === "admin" ? "/admin" : "/"} className="flex items-center gap-2.5 no-underline group">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition-transform">
              X
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-[15px] leading-tight tracking-tight text-sidebar-foreground">EDU-04</span>
              <span className="text-[10.5px] font-medium text-sidebar-foreground/50">Cổng Giảng viên & Quản trị</span>
            </div>
          </Link>
          <button 
            type="button" 
            className="md:hidden p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-xl transition-colors cursor-pointer" 
            onClick={() => setOpen(false)} 
            aria-label="Đóng menu"
          >
            <Icon name="menu" size={18} />
          </button>
        </div>

        {role !== "admin" && (
          <div className="p-3">
            <Link
              href="/"
              className="flex items-center justify-between w-full bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2.5 rounded-xl text-[13.5px] font-semibold shadow-xs transition-all active:scale-[0.98] no-underline group"
              onClick={(e) => {
                if (onNewChat) {
                  e.preventDefault();
                  onNewChat();
                  setOpen(false);
                }
              }}
            >
              <div className="flex items-center gap-2">
                <Icon name="chat" size={16} />
                <span>{onNewChat ? "Hội thoại mới" : "Về Hội thoại"}</span>
              </div>
              <div className="bg-primary-foreground/20 rounded-lg p-1 group-hover:rotate-90 transition-transform">
                <Icon name="plus" size={12} />
              </div>
            </Link>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[10.5px] font-semibold text-sidebar-foreground/45 uppercase tracking-wider mb-2 px-3">
            Chức năng chính
          </div>
          {[
            ...(role !== "admin" ? [{ href: `/`, label: "Hội thoại (Chat)", icon: "chat" as const }] : []),
            ...(role !== "admin" ? [{ href: `/library${q}`, label: "Thư viện tài liệu", icon: "library" as const }] : []),
            ...(canManage ? [{ href: `/lecturer/documents${q}`, label: "Quản lý tài liệu", icon: "docs" as const }] : []),
            ...(courses?.some((c) => c.can_review) ? [{ href: `/lecturer/review${q}`, label: "Duyệt tài liệu", icon: "review" as const }] : []),
            ...(canManage ? [{ href: `/lecturer/dashboard${q}`, label: "Báo cáo thống kê", icon: "chart" as const }] : []),
            ...(role === "admin" ? [{ href: "/admin", label: "Quản trị hệ thống", icon: "admin" as const }] : [])
          ].map((item) => {
            const isActive = pathname === item.href.split("?")[0];
            return (
              <Link 
                key={item.href}
                href={item.href} 
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all no-underline ${
                  isActive 
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-xs" 
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <div className={`${isActive ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"} transition-colors`}>
                  <Icon name={item.icon} size={17} />
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {courses && courses.length > 0 && onCourseChange && (
          <div className="p-3 border-t border-sidebar-border/40 shrink-0 bg-sidebar-accent/20">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Môn đang chọn</span>
              <div className="relative">
                <select 
                  value={courseId ?? ""} 
                  onChange={(e) => onCourseChange(e.target.value)}
                  aria-label="Chọn môn phụ trách"
                  className="w-full appearance-none bg-background text-foreground border border-sidebar-border/80 hover:border-sidebar-border rounded-xl px-3.5 py-2 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-xs cursor-pointer"
                >
                  {!course && <option value="">— Chọn môn —</option>}
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <Icon name="menu" size={13} />
                </div>
              </div>
            </label>
          </div>
        )}

        {side && <div className="px-3 py-2 bg-sidebar-accent/10">{side}</div>}

        <div className="p-3 border-t border-sidebar-border/50 flex items-center justify-between shrink-0 bg-sidebar/50 backdrop-blur-md">
          {profile && (
            <Link href="/profile" className="flex items-center gap-2.5 no-underline group min-w-0 flex-1 hover:bg-sidebar-accent/70 p-1.5 -ml-1 rounded-xl transition-colors" title="Hồ sơ cá nhân">
              <span className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-xs shrink-0 shadow-xs">
                {initials}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-sidebar-foreground truncate">{profile.user.display_name}</span>
                <span className="text-[11px] font-medium text-sidebar-foreground/50 truncate">{ROLE_LABEL[profile.user.role] ?? profile.user.role}</span>
              </div>
            </Link>
          )}
          <div className="flex items-center gap-0.5 shrink-0 ml-1">
            <button
              type="button"
              className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 rounded-xl transition-colors cursor-pointer"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
              title={theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
            <button 
              type="button" 
              className="p-2 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors cursor-pointer" 
              onClick={onSignOut} 
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* SCRIM for mobile */}
      {open && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden transition-opacity" 
          onClick={() => setOpen(false)} 
        />
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen min-w-0 bg-background relative">
        <header className="h-[54px] flex items-center justify-between px-4 border-b border-border/40 md:hidden shrink-0 glass-panel sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <button 
              type="button" 
              className="p-2 text-muted-foreground hover:bg-secondary rounded-xl transition-colors" 
              onClick={() => setOpen(true)}
              aria-label="Mở menu"
            >
              <Icon name="menu" size={18} />
            </button>
            <span className="font-extrabold text-base bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">EDU-04</span>
          </div>
          {profile && (
            <Link href="/profile" className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs border border-primary/20">
              {initials}
            </Link>
          )}
        </header>
        <div className="flex-1 overflow-y-auto relative">
          {children}
        </div>
      </main>
    </div>
  );
}
