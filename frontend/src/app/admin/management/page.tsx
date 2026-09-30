"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, FileText, Loader2, Lock, RefreshCw, Search, ShieldAlert } from "lucide-react";
import AdminShell, { managementSections, type ManagementSection } from "@/components/admin-shell";
import { API, authHeaders, responseError } from "@/lib/api-errors";

type User = { id: string; login_id: string; display_name: string; role: string; status: string };
type Course = { id: string; code: string | null; name: string; term: string | null; status: string };
type Document = { id: string; title: string; doc_type: string; emergency_locked: boolean };
type AuditLog = { created_at: string; action: string; object_type: string; object_id: string; actor: string; reason: string | null };
function ManagementRoute() {
  const params = useSearchParams();
  const tab = managementSections.find(section => section.id === params.get("tab"))?.id || "users";
  return <ManagementContent key={tab} activeTab={tab} />;
}

export default function AdminManagementPage() {
  return <Suspense fallback={<AdminShell><p role="status" className="admin-empty">Đang tải mục quản trị…</p></AdminShell>}><ManagementRoute /></Suspense>;
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}/admin${path}`, { ...init, headers: { ...authHeaders(), ...init.headers } });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

function ManagementContent({ activeTab }: { activeTab: ManagementSection }) {
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError("");
    async function load() {
      if (activeTab === "users") {
        const data = await request("/users", { signal: controller.signal });
        if (!controller.signal.aborted) setUsers(data.items);
      } else if (activeTab === "audit") {
        const data = await request("/audit?limit=100", { signal: controller.signal });
        if (!controller.signal.aborted) setLogs(data.items);
      } else {
        const data = await request("/courses", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setCourses(data.items);
        if (activeTab === "documents") {
          const course = data.items.some((c: Course) => c.id === selectedCourse) ? selectedCourse : data.items[0]?.id || "";
          setSelectedCourse(course);
          const docs = course ? await request(`/documents?course_id=${encodeURIComponent(course)}`, { signal: controller.signal }) : { items: [] };
          if (!controller.signal.aborted) setDocuments(docs.items);
        }
      }
    }
    load().catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeTab, selectedCourse, attempt]);

  async function update(path: string, method: string, body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setNotice("Đã cập nhật thành công."); setAttempt(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể cập nhật dữ liệu."); }
    finally { setBusy(false); }
  }
  function toggleUser(user: User) {
    const status = user.status === "active" ? "locked" : "active";
    const reason = window.prompt(status === "locked" ? "Lý do khóa tài khoản:" : "Lý do mở khóa tài khoản:");
    if (reason?.trim()) void update(`/users/${encodeURIComponent(user.id)}`, "PATCH", { status, reason: reason.trim() });
  }
  function toggleDocument(doc: Document) {
    const reason = window.prompt(doc.emergency_locked ? "Lý do mở khóa tài liệu:" : "Lý do khóa khẩn cấp tài liệu:");
    if (reason?.trim()) void update(`/documents/${encodeURIComponent(doc.id)}/lock`, "POST", { locked: !doc.emergency_locked, reason: reason.trim() });
  }
  const matches = (...values: (string | null)[]) => values.join(" ").toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
  const visibleUsers = users.filter(u => matches(u.login_id, u.display_name, u.role));
  const visibleCourses = courses.filter(c => matches(c.name, c.code, c.id));
  const visibleDocuments = documents.filter(d => matches(d.title));
  const visibleLogs = logs.filter(l => matches(l.action, l.actor, l.object_id, l.reason));

  return <AdminShell managementTab={activeTab}>
    <div className="admin-heading"><div><span className="admin-eyebrow">Quản trị hệ thống</span><h1>{managementSections.find(section => section.id === activeTab)?.label}</h1><p>{activeTab === "users" ? "Quản lý tài khoản và trạng thái truy cập của người dùng." : activeTab === "courses" ? "Theo dõi các môn học và học phần trong hệ thống." : activeTab === "documents" ? "Kiểm soát quyền phục vụ nội dung và khóa tài liệu khi cần thiết." : "Theo dõi lịch sử thao tác và các thay đổi trong hệ thống."}</p></div><button className="admin-btn" disabled={loading || busy} onClick={() => setAttempt(n => n + 1)}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Tải lại dữ liệu</button></div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
    <section className="admin-panel overflow-hidden">
      <header className="admin-panel-header"><div><h2>{activeTab === "users" ? "Danh sách tài khoản" : activeTab === "courses" ? "Danh sách môn học" : activeTab === "documents" ? "Kiểm soát tài liệu" : "Nhật ký hệ thống"}</h2><p>{activeTab === "users" ? "Theo dõi vai trò và quản lý trạng thái truy cập." : activeTab === "courses" ? "Các học phần hiện có trên hệ thống." : activeTab === "documents" ? "Khóa tài liệu sẽ ngừng phục vụ nội dung trên thư viện và Chat AI." : "100 hoạt động gần nhất của hệ thống."}</p></div><label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-white/10 sm:w-64"><Search size={16} className="shrink-0 text-slate-400" /><input aria-label="Tìm trong danh sách" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm trong danh sách…" className="min-w-0 flex-1 bg-transparent py-2.5 text-xs outline-none" /></label></header>
      {activeTab === "documents" && <div className="border-b border-slate-100 p-5 dark:border-white/5"><p className="mb-4 flex items-start gap-2 text-xs leading-5 text-amber-600 dark:text-amber-400"><ShieldAlert size={16} className="shrink-0" />Chỉ dùng khóa khẩn cấp khi nội dung có vấn đề nghiêm trọng. Mọi thay đổi đều được ghi lại trong nhật ký.</p><label htmlFor="admin-course" className="mb-2 block text-xs font-medium">Môn học</label><select id="admin-course" disabled={busy} value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} className="admin-input max-w-md"><option value="">Chọn môn học</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      {loading ? <div role="status" className="admin-empty flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" />Đang tải dữ liệu…</div> : error ? <div className="admin-empty">Không thể hiển thị dữ liệu. Vui lòng tải lại.</div> : <>
        {activeTab === "users" && <div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Tài khoản</th><th>Tên hiển thị</th><th>Vai trò</th><th>Trạng thái</th><th className="text-right">Thao tác</th></tr></thead><tbody>{visibleUsers.map(u => <tr key={u.id}><td className="font-medium">{u.login_id}</td><td>{u.display_name}</td><td><span className="admin-pill">{({ student: "Sinh viên", lecturer: "Giảng viên", reviewer: "Người duyệt", admin: "Quản trị viên" } as Record<string, string>)[u.role] || u.role}</span></td><td><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ${u.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"}`}><span className="h-1 w-1 rounded-full bg-current" />{u.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td><td className="text-right"><button disabled={busy} onClick={() => toggleUser(u)} className="admin-btn whitespace-nowrap"><Lock size={13} />{u.status === "active" ? "Khóa" : "Mở khóa"}</button></td></tr>)}</tbody></table>{!visibleUsers.length && <p className="admin-empty">Không tìm thấy tài khoản phù hợp.</p>}</div>}
        {activeTab === "courses" && <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{visibleCourses.map(c => <article key={c.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><BookOpen size={22} className="mb-4 text-violet-500" /><h3 className="font-semibold">{c.name}</h3><p className="mt-2 text-xs text-slate-400">{c.code || c.id} · Học kỳ {c.term || "Chưa thiết lập"}</p><span className="admin-pill mt-4">{c.status}</span></article>)}{!visibleCourses.length && <p className="admin-empty col-span-full">Không tìm thấy môn học phù hợp.</p>}</div>}
        {activeTab === "documents" && <div className="divide-y divide-slate-100 px-5 dark:divide-white/5">{visibleDocuments.map(d => <article key={d.id} className="flex flex-wrap items-center gap-3 py-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/5"><FileText size={19} /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{d.title}</h3><p className="mt-1 text-xs text-slate-400">{d.doc_type} · {d.emergency_locked ? "Đang khóa khẩn cấp" : "Không bị khóa"}</p></div><button disabled={busy} className={`admin-btn ${d.emergency_locked ? "" : "admin-btn-danger"}`} onClick={() => toggleDocument(d)}><Lock size={14} />{d.emergency_locked ? "Mở khóa" : "Khóa khẩn cấp"}</button></article>)}{!visibleDocuments.length && <p className="admin-empty">{selectedCourse ? "Không có tài liệu phù hợp." : "Chọn môn học để quản lý tài liệu."}</p>}</div>}
        {activeTab === "audit" && <div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Thời gian</th><th>Hành động</th><th>Đối tượng</th><th>Người thực hiện</th><th>Lý do</th></tr></thead><tbody>{visibleLogs.map((log, i) => <tr key={`${log.created_at}-${i}`}><td className="whitespace-nowrap text-xs text-slate-500">{new Date(log.created_at).toLocaleString("vi-VN")}</td><td className="font-medium">{log.action}</td><td className="text-xs">{log.object_type}: {log.object_id}</td><td>{log.actor}</td><td className="min-w-48 text-slate-500">{log.reason || "—"}</td></tr>)}</tbody></table>{!visibleLogs.length && <p className="admin-empty">Không có hoạt động phù hợp.</p>}</div>}
      </>}
    </section>
  </AdminShell>;
}
