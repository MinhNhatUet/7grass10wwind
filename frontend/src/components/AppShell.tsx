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
    <div className={`app${open ? " side-open" : ""}`}>
      <aside className="app-side" aria-label="Điều hướng">
        <div className="side-top">
          <Link href={role === "admin" ? "/admin" : "/chat"} className="brand-sm">
            <span className="logo-mark" aria-hidden="true">
              X
            </span>
            <span className="brand-text">EDU-04</span>
          </Link>
          <button type="button" className="icon-btn side-close" onClick={() => setOpen(false)} aria-label="Đóng menu">
            ×
          </button>
        </div>

        {role !== "admin" && (
          <Link
            href="/chat"
            className={`side-new${pathname === "/chat" ? " active" : ""}`}
            onClick={(e) => {
              if (onNewChat) {
                e.preventDefault();
                onNewChat();
                setOpen(false);
              }
            }}
          >
            <span className="side-new-icon">
              <Icon name="chat" size={15} />
            </span>
            Chat mới
            <Icon name="plus" size={16} />
          </Link>
        )}

        <nav className="side-nav">
          {role !== "admin" && nav(`/library${q}`, "Thư viện tài liệu", "library")}
          {canManage && nav(`/lecturer/documents${q}`, "Quản lý tài liệu", "docs")}
          {courses?.some((c) => c.can_review) && nav(`/lecturer/review${q}`, "Duyệt tài liệu", "review")}
          {canManage && nav(`/lecturer/dashboard${q}`, "Thống kê", "chart")}
          {role === "admin" && nav("/admin", "Quản trị", "admin")}
        </nav>

        {courses && courses.length > 0 && onCourseChange && (
          <label className="side-course">
            <span className="side-label">Môn đang chọn</span>
            <select value={courseId ?? ""} onChange={(e) => onCourseChange(e.target.value)}>
              {!course && <option value="">— Chọn môn —</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="side-extra">{side}</div>

        <div className="side-foot">
          {profile && (
            <Link href="/profile" className="user-chip" title="Hồ sơ cá nhân">
              <span className="avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="user-meta">
                <span className="user-name">{profile.user.display_name}</span>
                <span className="role-badge">{ROLE_LABEL[profile.user.role] ?? profile.user.role}</span>
              </span>
            </Link>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
            title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
          <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Đăng xuất" title="Đăng xuất">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <button type="button" className="side-scrim" aria-label="Đóng menu" onClick={() => setOpen(false)} />

      <div className="app-main">
        <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu">
          <Icon name="menu" />
        </button>
        {children}
      </div>
    </div>
  );
}
