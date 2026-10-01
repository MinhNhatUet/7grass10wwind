"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, ArrowLeft, BookOpen, ChevronDown, ChevronRight, History, Home, Lock, Menu, Moon, ShieldCheck, SlidersHorizontal, Sun, Users, X } from "lucide-react";
import "./admin-shell.css";

const navigation = [
  { href: "/admin/monitoring", label: "Giám sát vận hành", icon: Activity },
  { href: "/admin/quota", label: "Cấu hình hạn mức", icon: SlidersHorizontal },
  { href: "/admin/management", label: "Quản trị hệ thống", icon: ShieldCheck },
];

export const managementSections = [
  { id: "users", label: "Người dùng", icon: Users },
  { id: "courses", label: "Môn học", icon: BookOpen },
  { id: "documents", label: "Khóa khẩn cấp", icon: Lock },
  { id: "audit", label: "Nhật ký hoạt động", icon: History },
] as const;
export type ManagementSection = typeof managementSections[number]["id"];

export default function AdminShell({ children, managementTab }: { children: ReactNode; managementTab?: ManagementSection }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = navigation.find(item => item.href === pathname);
  const isManagement = pathname === "/admin/management";
  const selectedSection = isManagement ? managementSections.find(item => item.id === (managementTab || "users")) : undefined;

  useEffect(() => {
    if (mobileOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mobileOpen]);

  const sidebar = <>
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-100 px-6 dark:border-white/5">
      <Link href="/admin" className="flex items-center gap-3 text-2xl font-extrabold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900"><BookOpen size={21} /></span>Vedu</Link>
      <button onClick={() => setMobileOpen(false)} aria-label="Đóng điều hướng" className="rounded-lg p-2 text-slate-500 lg:hidden"><X size={18} /></button>
    </div>
    <nav aria-label="Điều hướng quản trị" className="flex-1 space-y-2 overflow-y-auto p-4 text-sm font-medium">
      <p className="px-4 pb-2 pt-3 text-[11px] font-semibold tracking-widest text-slate-400">KHÔNG GIAN QUẢN TRỊ</p>
      {navigation.slice(0, 2).map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`admin-nav-link ${pathname === item.href ? "admin-nav-active" : ""}`}><item.icon size={19} /><span>{item.label}</span>{pathname === item.href && <ChevronRight size={15} className="ml-auto" />}</Link>)}
      <div role="group" aria-label="Quản trị hệ thống">
        <div className={`admin-nav-link admin-nav-parent ${isManagement ? "admin-nav-active" : ""}`}><ShieldCheck size={19} /><span>Quản trị hệ thống</span><ChevronDown size={15} className="ml-auto shrink-0 text-slate-400" /></div>
        <ul className="admin-subnav">
          {managementSections.map(item => {
            const active = selectedSection?.id === item.id;
            return <li key={item.id}><Link href={`/admin/management?tab=${item.id}`} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`admin-subnav-link ${active ? "admin-subnav-active" : ""}`}><item.icon size={15} className="shrink-0" /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}</Link></li>;
          })}
        </ul>
      </div>
    </nav>
    <div className="m-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><ShieldCheck size={21} className="mb-3 text-violet-500" /><p className="text-sm font-semibold">Quản trị viên</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Quản lý truy cập, tài nguyên và theo dõi hoạt động của hệ thống.</p></div>
  </>;

  return <div className="admin-shell flex h-dvh overflow-hidden bg-[#f8f9fa] text-slate-900 dark:bg-[#101114] dark:text-slate-100">
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-white/10 dark:bg-[#151619] lg:flex">{sidebar}</aside>
    <dialog ref={dialog} onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} onClick={e => { if (e.target === e.currentTarget) setMobileOpen(false); }} className="admin-mobile-dialog fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[280px] max-w-[85vw] border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40 dark:bg-[#151619] dark:text-slate-100"><div className="flex h-full flex-col">{sidebar}</div></dialog>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#151619]/90 sm:px-8">
        <div className="flex min-w-0 items-center gap-3 text-sm"><button aria-label="Mở điều hướng" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden"><Menu size={20} /></button><Link href="/admin" aria-label="Trang chủ" className="hidden text-slate-400 sm:block"><Home size={18} /></Link><ChevronRight size={15} className="hidden text-slate-300 sm:block" /><span className="hidden text-slate-500 sm:inline">Quản trị</span><ChevronRight size={15} className="hidden text-slate-300 sm:block" /><span className={`truncate ${selectedSection ? "hidden text-slate-500 xl:inline" : "font-semibold"}`}>{current?.label || "Quản trị hệ thống"}</span>{selectedSection && <><ChevronRight size={15} className="hidden shrink-0 text-slate-300 xl:block" /><span className="truncate font-semibold">{selectedSection.label}</span></>}</div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4"><Link href="/chat" className="hidden items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white md:flex"><ArrowLeft size={15} />Về Chat AI</Link><button aria-label="Đổi giao diện sáng tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><Moon size={17} className="dark:hidden" /><Sun size={17} className="hidden dark:block" /></button><Link href="/profile" aria-label="Hồ sơ quản trị viên" className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-violet-500">AD</Link></div>
      </header>
      <main className="admin-content min-h-0 flex-1 overflow-y-auto p-4 sm:p-8"><div className="mx-auto max-w-[1600px]">{children}</div></main>
    </div>
  </div>;
}
