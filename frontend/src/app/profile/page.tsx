"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, BookOpen, LogOut, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const roles: Record<string, string> = { student: "Sinh viên", lecturer: "Giảng viên", reviewer: "Người duyệt", admin: "Quản trị viên" };
type Profile = { user: { id: string; login_id: string; display_name: string; role: string }; session: { expires_at: string } };
type Course = { id: string; name: string; code?: string; term?: string; can_upload: boolean; can_review: boolean };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const { setTheme } = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const token = localStorage.getItem("token");
      if (!token) { window.location.replace("/login"); return; }
      try {
        const responses = await Promise.all(["/me", "/me/courses"].map(path => fetch(`${API}/api/v1${path}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })));
        if (responses.some(r => r.status === 401)) {
          localStorage.removeItem("token"); localStorage.removeItem("user");
          window.location.replace("/login"); return;
        }
        if (responses.some(r => !r.ok)) throw new Error("Không thể tải hồ sơ. Vui lòng thử lại.");
        const [me, subjects] = await Promise.all(responses.map(r => r.json()));
        setProfile(me); setCourses(subjects.items || []);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không thể kết nối máy chủ.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function logout() {
    setLeaving(true); setError("");
    try {
      const response = await fetch(`${API}/api/v1/auth/logout`, {
        method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok && response.status !== 401) throw new Error();
      localStorage.removeItem("token"); localStorage.removeItem("user");
      window.location.replace("/login");
    } catch { setError("Chưa đăng xuất được. Vui lòng kiểm tra kết nối và thử lại."); setLeaving(false); }
  }

  const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#081018] dark:text-slate-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600"><ArrowLeft size={16} /> Quay lại trợ lý</Link>
        <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-500">Không gian của bạn</p><h1 className="mt-2 text-3xl font-bold">Hồ sơ cá nhân</h1><p className="mt-2 text-sm text-slate-500">Thông tin tài khoản và quyền truy cập học liệu.</p></div>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-200">{error} <button onClick={() => window.location.reload()} className="underline ml-2">Thử lại</button></div>}
        {loading && <p role="status" className={`${card} animate-pulse`}>Đang tải hồ sơ…</p>}
        {profile && <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="h-24 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />
            <div className="px-6 pb-6"><div className="-mt-10 mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-indigo-100 text-2xl font-bold text-indigo-700 dark:border-slate-900">{(profile.user.display_name || profile.user.login_id).slice(0, 2).toUpperCase()}</div>
              <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-semibold">{profile.user.display_name}</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200">{roles[profile.user.role] || profile.user.role}</span></div>
              <p className="mt-1 text-sm text-slate-500 break-all">{profile.user.login_id}</p>
            </div>
          </section>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-6 md:col-span-2">
              <section className={card}><h2 className="mb-5 flex items-center gap-2 font-semibold"><UserRound size={18} className="text-blue-500" /> Thông tin tài khoản</h2>
                <dl className="grid gap-5 sm:grid-cols-2">{[["Tên hiển thị", profile.user.display_name], ["Tên đăng nhập", profile.user.login_id], ["Mã tài khoản", profile.user.id], ["Vai trò", roles[profile.user.role] || profile.user.role]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium break-all">{value}</dd></div>)}</dl>
                <p className="mt-5 text-xs text-slate-500">Thông tin được đồng bộ từ hệ thống. Liên hệ quản trị viên nếu cần thay đổi.</p>
              </section>
              <section className={card}><h2 className="mb-4 flex items-center gap-2 font-semibold"><BookOpen size={18} className="text-blue-500" /> Môn học của bạn <span className="ml-auto text-sm text-slate-500">{courses.length} môn</span></h2>
                {courses.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{courses.map(c => <li key={c.id} className="py-4 first:pt-0 last:pb-0"><p className="font-medium">{c.name}</p><p className="mt-1 text-xs text-slate-500">{c.code || c.id}{c.term ? ` · Học kỳ ${c.term}` : ""}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-blue-600 dark:text-blue-300"><span>Đọc học liệu</span>{c.can_upload && <span>· Tải tài liệu lên</span>}{c.can_review && <span>· Duyệt tài liệu</span>}</div></li>)}</ul> : <p className="text-sm text-slate-500">Chưa có môn học được cấp quyền truy cập.</p>}
              </section>
            </div>
            <div className="space-y-6">
              <section className={card}><h2 className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-500" /> Phiên đăng nhập</h2><p className="text-sm text-slate-500">Phiên hiện tại hết hạn lúc</p><p className="mt-2 text-sm font-medium">{new Date(profile.session.expires_at).toLocaleString("vi-VN")}</p></section>
              <section className={card}><h2 className="mb-4 font-semibold">Giao diện</h2><div className="flex gap-2">{([{ label: "Sáng", value: "light", Icon: Sun }, { label: "Tối", value: "dark", Icon: Moon }]).map(({ label, value, Icon }) => <button key={value} onClick={() => setTheme(value)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"><Icon size={16} />{label}</button>)}</div></section>
              <button onClick={logout} disabled={leaving} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"><LogOut size={16} />{leaving ? "Đang đăng xuất…" : "Đăng xuất"}</button>
            </div>
          </div>
        </>}
      </div>
    </main>
  );
}
