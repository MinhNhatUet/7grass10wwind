"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, BookOpen, Coins, ChevronRight, FileText, History, Home, LogOut, Menu, Moon, ShieldCheck, SlidersHorizontal, Sun, Users, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import "./admin-shell.css";

export const managementSections = [
  { id: "users", label: "Người dùng", icon: Users },
  { id: "courses", label: "Môn học", icon: BookOpen },
  { id: "documents", label: "Quản lý tài liệu", icon: FileText },
  { id: "audit", label: "Nhật ký hoạt động", icon: History },
] as const;
export type ManagementSection = typeof managementSections[number]["id"];

// D-61: admin không dùng Hỏi đáp; khu quản trị gồm Quản lý tài liệu · Giám sát · Cấu hình · Hệ thống
type NavLink = { href: string; label: string; icon: typeof Users; tab?: ManagementSection };
const groups: { title: string; items: NavLink[] }[] = [
  { title: "QUẢN LÝ TÀI LIỆU", items: [{ href: "/admin/management?tab=documents", tab: "documents", label: "Tài liệu & khóa khẩn cấp", icon: FileText }] },
  { title: "GIÁM SÁT", items: [
    { href: "/admin/monitoring", label: "Giám sát vận hành", icon: Activity },
    { href: "/admin/costs", label: "Chi phí AI", icon: Coins },
  ] },
  { title: "CẤU HÌNH", items: [{ href: "/admin/quota", label: "Cấu hình hạn mức", icon: SlidersHorizontal }] },
  { title: "HỆ THỐNG", items: [
    { href: "/admin/management?tab=users", tab: "users", label: "Người dùng", icon: Users },
    { href: "/admin/management?tab=courses", tab: "courses", label: "Môn học", icon: BookOpen },
    { href: "/admin/management?tab=audit", tab: "audit", label: "Nhật ký hoạt động", icon: History },
  ] },
];
const navigation = groups.flatMap((g) => g.items);

export default function AdminShell({ children, managementTab }: { children: ReactNode; managementTab?: ManagementSection }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    // D-62: không có trang hồ sơ — chỉ hiện tên người đăng nhập (đọc sau hydrate; quyền do server kiểm tra)
    let n = "Quản trị viên";
    try {
      n = JSON.parse(localStorage.getItem("user") || "{}").display_name || n;
    } catch {
      /* storage bị chặn → tên mặc định */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(n);
  }, []);
  const isManagement = pathname === "/admin/management";
  const isActive = (item: NavLink) => (item.tab ? isManagement && (managementTab || "users") === item.tab : pathname === item.href);
  const current = navigation.find(isActive);
  const group = groups.find((g) => current && g.items.includes(current));

  useEffect(() => {
    if (mobileOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mobileOpen]);

  const sidebar = <>
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-100 px-6 dark:border-white/5">
      <Link href="/admin" aria-label="VAssistant — Quản trị"><BrandLogo size={34} /></Link>
      <button onClick={() => setMobileOpen(false)} aria-label="Đóng điều hướng" className="rounded-lg p-2 text-slate-500 lg:hidden"><X size={18} /></button>
    </div>
    <nav aria-label="Điều hướng quản trị" className="flex-1 space-y-2 overflow-y-auto p-4 text-sm font-medium">
      {groups.map(g => <div key={g.title} role="group" aria-label={g.title}>
        <p className="px-4 pb-2 pt-3 text-[11px] font-semibold tracking-widest text-slate-400">{g.title}</p>
        {g.items.map(item => {
          const active = isActive(item);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`admin-nav-link ${active ? "admin-nav-active" : ""}`}><item.icon size={19} /><span>{item.label}</span>{active && <ChevronRight size={15} className="ml-auto" />}</Link>;
        })}
      </div>)}
    </nav>
    <div className="m-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><ShieldCheck size={21} className="mb-3 text-[#134d8b] dark:text-[#7fb3ea]" /><p className="text-sm font-semibold">Quản trị viên</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Quản lý truy cập, tài nguyên và theo dõi hoạt động của hệ thống.</p></div>
  </>;

  return <div className="admin-shell flex h-dvh overflow-hidden bg-[#f8f9fa] text-slate-900 dark:bg-[#101114] dark:text-slate-100">
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-white/10 dark:bg-[#151619] lg:flex">{sidebar}</aside>
    <dialog ref={dialog} onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} onClick={e => { if (e.target === e.currentTarget) setMobileOpen(false); }} className="admin-mobile-dialog fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[280px] max-w-[85vw] border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40 dark:bg-[#151619] dark:text-slate-100"><div className="flex h-full flex-col">{sidebar}</div></dialog>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#151619]/90 sm:px-8">
        <div className="flex min-w-0 items-center gap-3 text-sm"><button aria-label="Mở điều hướng" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden"><Menu size={20} /></button><Link href="/admin" aria-label="Trang chủ" className="hidden text-slate-400 sm:block"><Home size={18} /></Link><ChevronRight size={15} className="hidden text-slate-300 sm:block" /><span className="hidden text-slate-500 sm:inline">Quản trị</span><ChevronRight size={15} className="hidden text-slate-300 sm:block" />{group && <><span className="hidden text-slate-500 xl:inline">{group.title.charAt(0) + group.title.slice(1).toLowerCase()}</span><ChevronRight size={15} className="hidden shrink-0 text-slate-300 xl:block" /></>}<span className="truncate font-semibold">{current?.label || "Quản trị"}</span></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4"><button type="button" onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.replace("/login"); }} className="hidden items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white md:flex"><LogOut size={15} />Đăng xuất</button><button aria-label="Đổi giao diện sáng tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><Moon size={17} className="dark:hidden" /><Sun size={17} className="hidden dark:block" /></button><span className="max-w-[180px] truncate text-sm font-semibold">{name}</span></div>
      </header>
      <main className="admin-content min-h-0 flex-1 overflow-y-auto p-4 sm:p-8"><div className="mx-auto max-w-[1600px]">{children}</div></main>
    </div>
  </div>;
}
