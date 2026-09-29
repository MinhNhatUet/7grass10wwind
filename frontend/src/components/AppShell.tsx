"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { CourseItem, MeResponse } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/messages";

// Khung chung theo giao diện nhánh TV4 (integration/frontend-backend): sidebar trái kiểu ChatGPT — điều hướng theo
// quyền server trả về, vùng riêng của trang (vd. lịch sử chat), tài khoản + sáng/tối ở đáy. Logic quyền giữ nguyên.

interface Props {
  profile: MeResponse | null;
  courses: CourseItem[] | null;
  courseId?: string | null;
  onCourseChange?: (id: string) => void;
  onSignOut: () => void;
  side?: ReactNode; // nội dung riêng của trang trong sidebar (lịch sử hội thoại…)
  onNewChat?: () => void; // trang chat tự reset; trang khác: link về /chat
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
  } catch {
    /* trình duyệt chặn storage: theo hệ thống */
  }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppShell({ profile, courses, courseId, onCourseChange, onSignOut, side, onNewChat, children }: Props) {
  const role = profile?.user.role;
  const course = courses?.find((c) => c.id === courseId);
  const canManage = courses?.some((c) => c.can_upload || c.can_review);
  const q = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // sidebar trên màn hẹp
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => setOpen(false), [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("edu04.theme", next);
    } catch {
      /* chỉ là tiện ích giao diện */
    }
  }

  const nav = (href: string, label: string, icon: keyof typeof ICON) => (
    <Link href={href} className={`side-link${pathname === href.split("?")[0] ? " active" : ""}`}>
      <Icon name={icon} />
      {label}
    </Link>
  );
  const name = profile?.user.display_name ?? "";
  const initials = (name || "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-card border-r border-border flex flex-col transition-transform duration-300 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} md:static`} 
        aria-label="Điều hướng"
      >
        <div className="p-4 flex items-center justify-between shrink-0 border-b border-border/50">
          <Link href={role === "admin" ? "/admin" : "/"} className="flex items-center gap-2 font-bold text-lg text-primary no-underline">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              X
            </span>
            <span>EDU-04</span>
          </Link>
          <button type="button" className="md:hidden p-2 text-muted-foreground hover:bg-secondary rounded-lg" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <Icon name="menu" size={20} />
          </button>
        </div>

        {role !== "admin" && (
          <div className="p-3 pb-0">
            <Link
              href="/"
              className="flex items-center justify-between w-full bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2.5 rounded-xl font-medium transition-colors no-underline"
              onClick={(e) => {
                if (onNewChat) {
                  e.preventDefault();
                  onNewChat();
                  setOpen(false);
                }
              }}
            >
              <div className="flex items-center gap-2">
                <Icon name="chat" size={18} />
                Chat mới
              </div>
              <Icon name="plus" size={16} />
            </Link>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {[
            ...(role !== "admin" ? [{ href: `/library${q}`, label: "Thư viện tài liệu", icon: "library" as const }] : []),
            ...(canManage ? [{ href: `/lecturer/documents${q}`, label: "Quản lý tài liệu", icon: "docs" as const }] : []),
            ...(courses?.some((c) => c.can_review) ? [{ href: `/lecturer/review${q}`, label: "Duyệt tài liệu", icon: "review" as const }] : []),
            ...(canManage ? [{ href: `/lecturer/dashboard${q}`, label: "Thống kê", icon: "chart" as const }] : []),
            ...(role === "admin" ? [{ href: "/admin", label: "Quản trị", icon: "admin" as const }] : [])
          ].map((item) => (
            <Link 
              key={item.href}
              href={item.href} 
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors no-underline ${pathname === item.href.split("?")[0] ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </Link>
          ))}
        </nav>

        {courses && courses.length > 0 && onCourseChange && (
          <div className="p-4 border-t border-border/50 shrink-0">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Môn đang chọn</span>
              <select 
                value={courseId ?? ""} 
                onChange={(e) => onCourseChange(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                {!course && <option value="">— Chọn môn —</option>}
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {side && <div className="px-4 py-2">{side}</div>}

        <div className="p-4 border-t border-border flex items-center justify-between shrink-0 bg-card">
          {profile && (
            <Link href="/profile" className="flex items-center gap-3 no-underline group min-w-0" title="Hồ sơ cá nhân">
              <span className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-bold text-foreground shrink-0 border border-border group-hover:border-primary/50 transition-colors">
                {initials}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{profile.user.display_name}</span>
                <span className="text-[11px] text-muted-foreground truncate">{ROLE_LABEL[profile.user.role] ?? profile.user.role}</span>
              </div>
            </Link>
          )}
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Chuyển sáng" : "Chuyển tối"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
            <button 
              type="button" 
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" 
              onClick={onSignOut} 
              title="Đăng xuất"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* SCRIM for mobile */}
      {open && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setOpen(false)} 
        />
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen min-w-0 bg-background">
        <header className="h-[60px] flex items-center px-4 border-b border-border md:hidden shrink-0">
          <button type="button" className="p-2 text-muted-foreground hover:bg-secondary rounded-lg" onClick={() => setOpen(true)}>
            <Icon name="menu" size={20} />
          </button>
          <span className="font-semibold ml-2">EDU-04</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
