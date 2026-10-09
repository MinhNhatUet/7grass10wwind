"use client";

// Khung chung cho các trang học tập (D-54): một thanh bên cố định — chat mới, điều hướng theo vai trò, lịch sử hội
// thoại, tài khoản, sáng/tối — để Chat, Tài liệu, Ôn tập, Lộ trình là MỘT ứng dụng liền mạch thay vì các trang rời.
// Trang con giao tiếp với thanh bên qua sự kiện window: CONV_CHANGED (tải lại lịch sử), ACTIVE_CONV (tô hội thoại đang mở).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import * as HoverCard from "@radix-ui/react-hover-card";
import {
  BookOpen, Check, ClipboardList, Compass, FolderOpen, LogOut, Menu, MessageSquare, Moon, MoreHorizontal, Pencil, Plus,
  Sun, Target, Trash2, Zap,
} from "lucide-react";
import { API } from "@/lib/api-errors";
import { StudyPinsBar } from "@/components/study-pins";

export const CONV_CHANGED = "edu04:conversations-changed";
export const ACTIVE_CONV = "edu04:active-conversation";

type Conv = { id: string; title: string | null };
type Me = { display_name?: string; role?: string } | null;

const token = () => (typeof window === "undefined" ? null : localStorage.getItem("token"));

async function call(path: string, init: RequestInit = {}) {
  const t = token();
  if (!t) return null;
  const res = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, ...init.headers } });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return null;
  }
  return res;
}

function NavItem({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] tracking-[-0.01em] transition-all duration-200 no-underline ${active ? "bg-primary/10 dark:bg-primary/15 font-semibold text-primary dark:text-primary shadow-2xs" : "text-foreground/70 hover:bg-secondary/80 hover:text-foreground active:scale-[0.99]"}`}>
      {icon} {label}
    </Link>
  );
}

export function MainShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(true);
  const [user, setUser] = useState<Me>(null);
  const [history, setHistory] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    const res = await call("/conversations");
    if (res?.ok) setHistory(((await res.json()).items || []) as Conv[]);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      const me = stored ? JSON.parse(stored) : null;
      // D-61: admin không dùng Hỏi đáp/học tập → về khu quản trị (server cũng chặn admin gửi câu hỏi)
      if (me?.role === "admin") { router.replace("/admin"); return; }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc localStorage sau hydrate (server không có)
      if (me) setUser(me);
      // màn hình nhỏ: thanh bên mặc định đóng (mở dạng phủ); lựa chọn đóng/mở được nhớ trên máy này
      const saved = localStorage.getItem("sidebar-open");
      setOpen(saved !== null ? saved === "1" : window.innerWidth >= 768);
    } catch {
      /* storage bị chặn → giữ mặc định */
    }
    void loadHistory();
    const onChanged = () => void loadHistory();
    const onActive = (e: Event) => setActiveId((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(CONV_CHANGED, onChanged);
    window.addEventListener(ACTIVE_CONV, onActive);
    return () => {
      window.removeEventListener(CONV_CHANGED, onChanged);
      window.removeEventListener(ACTIVE_CONV, onActive);
    };
  }, [loadHistory, router]);

  const toggle = (v: boolean) => {
    setOpen(v);
    try { localStorage.setItem("sidebar-open", v ? "1" : "0"); } catch { /* bỏ qua */ }
  };
  // màn hình nhỏ: chọn một mục điều hướng thì đóng lớp phủ
  const afterNavigate = () => { if (window.innerWidth < 768) toggle(false); };

  async function rename(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    const res = await call(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    if (res?.ok) setHistory((h) => h.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  async function remove(id: string) {
    if (!window.confirm("Xoá hội thoại này?")) return;
    const res = await call(`/conversations/${id}`, { method: "DELETE" });
    if (!res || (!res.ok && res.status !== 204)) return;
    setHistory((h) => h.filter((c) => c.id !== id));
    if (activeId === id) router.push(`/?new=${Date.now()}`);
  }

  async function removeAll() {
    if (!history.length || !window.confirm("Xoá TẤT CẢ lịch sử hội thoại? Không khôi phục được.")) return;
    const res = await call("/conversations", { method: "DELETE" });
    if (res?.ok) {
      setHistory([]);
      if (pathname === "/") router.push(`/?new=${Date.now()}`);
    }
  }

  const role = user?.role;
  const student = !role || role === "student";
  const staff = role === "lecturer" || role === "reviewer";
  const at = (p: string) => pathname === p;

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden isolate relative">
      {/* lớp phủ khi mở thanh bên trên màn hình nhỏ */}
      {open && <div className="md:hidden fixed inset-0 z-30 bg-black/30" onClick={() => toggle(false)} aria-hidden="true" />}

      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            aria-label="Điều hướng"
            className="h-full bg-sidebar/95 backdrop-blur-2xl border-r border-sidebar-border flex flex-col shrink-0 z-40 overflow-hidden fixed md:relative inset-y-0 left-0 shadow-subtle"
          >
            <div className="p-3 w-[260px] flex justify-between items-center shrink-0">
              <button type="button" onClick={() => toggle(false)} aria-label="Thu gọn thanh bên"
                className="p-2 text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer rounded-lg hover:bg-secondary/80 active:scale-95 transition-all">
                <Menu size={20} />
              </button>
            </div>

            <div className="px-3 pb-3 w-[260px] shrink-0">
              <button type="button" onClick={() => { router.push(`/?new=${Date.now()}`); afterNavigate(); }}
                className="w-full flex items-center justify-between border border-sidebar-border text-foreground px-3.5 py-2.5 rounded-xl cursor-pointer text-[13.5px] font-medium bg-card/60 hover:bg-secondary/80 hover:border-primary/30 active:scale-[0.985] shadow-2xs transition-all">
                <span className="flex items-center gap-2.5">
                  <span className="w-[22px] h-[22px] rounded-lg bg-gradient-to-tr from-primary to-primary/80 flex items-center justify-center shadow-xs ring-1 ring-white/20"><Zap size={12} className="text-primary-foreground" /></span>
                  Chat mới
                </span>
                <Plus size={16} className="text-muted-foreground" />
              </button>
            </div>

            <nav className="px-3 py-1 flex flex-col gap-0.5 w-[260px] shrink-0" onClick={afterNavigate}>
              <NavItem href="/" icon={<MessageSquare size={18} />} label="Hỏi đáp" active={at("/")} />
              {/* D-59: giảng viên/người duyệt chỉ có Hỏi đáp · Quản lý tài liệu · Câu hỏi trắc nghiệm */}
              {!staff && <NavItem href="/library" icon={<Compass size={18} />} label="Tài liệu học tập" active={at("/library")} />}
              {student && <NavItem href="/learning" icon={<BookOpen size={18} />} label="Ôn tập & đề kiểm tra" active={at("/learning")} />}
              {student && <NavItem href="/learning/plans" icon={<Target size={18} />} label="Lộ trình học" active={at("/learning/plans")} />}
              {staff && (
                <NavItem href={role === "reviewer" ? "/hub/review" : "/hub/manage"} icon={<FolderOpen size={18} />}
                  label={role === "reviewer" ? "Duyệt tài liệu" : "Quản lý tài liệu"} active={pathname.startsWith("/hub/") || at("/dashboard")} />
              )}
              {staff && <NavItem href="/learning" icon={<ClipboardList size={18} />} label="Câu hỏi trắc nghiệm" active={at("/learning")} />}
            </nav>

            <div className="flex-1 overflow-y-auto px-3 py-4 w-[260px]">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-black/40 dark:text-white/40">Gần đây</span>
                {history.length > 0 && (
                  <button type="button" onClick={() => void removeAll()} className="text-[11px] text-black/40 dark:text-white/40 hover:text-red-500 bg-transparent border-0 cursor-pointer">Xoá tất cả</button>
                )}
              </div>
              {history.length === 0 && <p className="px-2 text-[12px] text-black/40 dark:text-white/40">Chưa có hội thoại nào.</p>}
              {history.map((c) => (
                <div key={c.id}
                  onClick={() => { if (renamingId !== c.id) { router.push(`/?conv=${encodeURIComponent(c.id)}`); afterNavigate(); } }}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer mb-0.5 hover:bg-black/5 dark:hover:bg-white/5 ${activeId === c.id && at("/") ? "bg-black/[0.07] dark:bg-white/10" : ""}`}>
                  {renamingId === c.id ? (
                    <form className="flex items-center gap-1 w-full" onSubmit={(e) => { e.preventDefault(); void rename(c.id); }}>
                      <input ref={renameRef} value={renameValue} autoFocus aria-label="Tên hội thoại"
                        onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void rename(c.id)}
                        onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }} onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 text-[14px] bg-white dark:bg-white/10 border border-blue-400 rounded px-1.5 py-0.5 outline-none" />
                      <button type="submit" onClick={(e) => e.stopPropagation()} aria-label="Lưu tên" className="p-0.5 text-blue-500 bg-transparent border-0 cursor-pointer"><Check size={14} /></button>
                    </form>
                  ) : (
                    <span className="truncate text-[14px] text-black/80 dark:text-white/80">{c.title || "Hội thoại mới"}</span>
                  )}
                  {renamingId !== c.id && (
                    <HoverCard.Root openDelay={0} closeDelay={150}>
                      <HoverCard.Trigger asChild>
                        <button type="button" onClick={(e) => e.stopPropagation()} aria-label="Tuỳ chọn hội thoại"
                          className="shrink-0 ml-2 p-1 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 text-black/50 dark:text-white/50 bg-transparent border-0 cursor-pointer rounded">
                          <MoreHorizontal size={16} />
                        </button>
                      </HoverCard.Trigger>
                      <HoverCard.Portal>
                        <HoverCard.Content side="right" align="start" sideOffset={8}
                          className="w-[160px] font-sans bg-white dark:bg-[#1a1b1e] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 py-1.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.title || ""); }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-left bg-transparent border-0 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10">
                            <Pencil size={15} /> Đổi tên
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); void remove(c.id); }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-left text-[#ff6b6b] bg-transparent border-0 cursor-pointer hover:bg-[#ff6b6b]/10">
                            <Trash2 size={15} /> Xoá
                          </button>
                        </HoverCard.Content>
                      </HoverCard.Portal>
                    </HoverCard.Root>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-sidebar-border flex items-center justify-between shrink-0 w-[260px] bg-sidebar/50 backdrop-blur-md">
              {/* D-62: bỏ trang hồ sơ cá nhân — chỉ hiện tên người dùng */}
              <span className="min-w-0 truncate p-1.5 text-[13px] font-semibold tracking-tight text-foreground/90">{user?.display_name || "Khách"}</span>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Chuyển giao diện sáng/tối"
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:scale-95 transition-all rounded-lg border-0 cursor-pointer bg-transparent">
                  <Sun size={17} className="hidden dark:block text-amber-400" /><Moon size={17} className="block dark:hidden" />
                </button>
                <button type="button" aria-label="Đăng xuất" title="Đăng xuất"
                  onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/login"; }}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all rounded-lg border-0 cursor-pointer bg-transparent">
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0 h-screen overflow-hidden flex flex-col relative">
        {!open && (
          <div className="h-12 shrink-0 flex items-center px-3 border-b border-black/5 dark:border-white/5">
            <button type="button" onClick={() => toggle(true)} aria-label="Mở thanh bên"
              className="p-2 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white bg-transparent border-0 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
              <Menu size={20} />
            </button>
          </div>
        )}
        {student && <StudyPinsBar />}
        <div className="flex-1 min-h-0 relative">{children}</div>
      </main>
    </div>
  );
}
