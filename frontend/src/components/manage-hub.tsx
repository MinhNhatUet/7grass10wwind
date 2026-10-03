"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import "./lecturer-hub.css";
import {
  AlertCircle,
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import LecturerDashboard from "./lecturer-dashboard";
import { DocumentStatus, StatusBadge } from "./document-status";
import ProcessingStatus, { ProcessingInfo } from "./processing-status";
import { errorCodeMessage } from "../lib/api-errors";

const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1`;

type Course = { id: string; name: string; can_upload: boolean; can_review: boolean };
type Meta = { title: string; doc_type: string; version_label: string; authors: string; provenance: string; usage_permission: string; acl_roles: string[]; download_allowed: boolean; integrity_label: string; chapter: string };
type Version = Meta & ProcessingInfo & { file_type: string; is_current: boolean; emergency_locked: boolean; version_id: string; document_id: string; revision: number; state: string; page_count: number; quality_warnings: unknown[]; reject_reason?: string };
type Preview = { version: Version; can_edit: boolean; can_decide: boolean; pages: { locator: { value: number }; text: string }[] };

const empty: Meta = { title: "", doc_type: "textbook", version_label: "1", authors: "", provenance: "", usage_permission: "pending", acl_roles: ["lecturer", "reviewer"], download_allowed: false, integrity_label: "learning_material", chapter: "" };

async function api(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem("token");
  if (!token) { window.location.replace("/login"); throw new Error("Vui lòng đăng nhập"); }
  const r = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (r.status === 401) { window.location.replace("/login"); throw new Error("Phiên đã hết hạn"); }
  const data = await r.json();
  if (!r.ok) throw new Error(r.status === 409 ? "Dữ liệu đã thay đổi hoặc file trùng. Hãy tải lại trước khi tiếp tục." : data.error?.message || errorCodeMessage(data.error?.code));
  return data;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const flow = [
  { label: "Bản nháp", icon: FileText },
  { label: "Xem trước / sửa metadata", icon: Settings2 },
  { label: "Gửi duyệt", icon: Send },
  { label: "Indexing", icon: Loader2 },
  { label: "Published", icon: CheckCircle2 },
];
const stateStep: Record<string, number> = { Draft: 0, NeedsReview: 1, Rejected: 1, PendingApproval: 2, Approved: 3, Processing: 3, Indexing: 3, Published: 4, Failed: 1 };

function cn(...xs: Array<string | false | undefined>) { return xs.filter(Boolean).join(" "); }
function shortDate(input?: string) { return input ? new Date(input).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
function isAttention(state: string) { return ["Failed", "Rejected", "NeedsReview"].includes(state); }

export default function ManageHub({ viewer = false, defaultTab }: { viewer?: boolean; defaultTab?: string }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [meta, setMeta] = useState<Meta>({ ...empty });
  const [file, setFile] = useState<File | null>(null);
  const [newDocument, setNewDocument] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [originalUrl, setOriginalUrl] = useState("");
  const [originalError, setOriginalError] = useState("");
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(true);
  const [filterState, setFilterState] = useState("All");
  const [activeMenu, setActiveMenu] = useState(defaultTab || (viewer ? "Xem và duyệt tài liệu" : "Quản lý tài liệu"));
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const selectedVersion = preview?.version.version_id;
  const canUpload = !!courses.find(c => c.id === course)?.can_upload;
  const editable = !preview ? canUpload : preview.can_edit && ["Draft", "NeedsReview", "Rejected", "PendingApproval"].includes(preview.version.state);
  const currentStep = stateStep[preview?.version.state || "Draft"] ?? 0;

  useEffect(() => {
    if (!viewer || !selectedVersion) return;
    const controller = new AbortController();
    let objectUrl = "";
    setOriginalUrl(""); setOriginalError("");
    fetch(`${API}/review/versions/${selectedVersion}/original`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Không thể mở bản gốc hoặc bạn không còn quyền xem.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setOriginalUrl(objectUrl);
      })
      .catch(e => { if (!controller.signal.aborted) setOriginalError(e.message); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [viewer, selectedVersion]);

  useEffect(() => {
    api("/me/courses")
      .then(d => { const rows = d.items.filter((c: Course) => c.can_upload || c.can_review); setCourses(rows); const requested = new URLSearchParams(window.location.search).get("course"); setCourse(rows.find((c: Course) => c.id === requested)?.id || rows[0]?.id || ""); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!course) return;
    let active = true;
    setVersions([]); setPreview(null); setMeta({ ...empty }); setFile(null); setNewDocument(null);
    api(`/manage/versions?course_id=${encodeURIComponent(course)}`).then(d => { if (active) {
      setVersions(d.items);
      if (viewer) {
        const requested = new URLSearchParams(window.location.search).get("version");
        const target = d.items.find((v: Version) => v.version_id === requested) || d.items[0];
        if (target) void run(() => open(target.version_id));
      }
    } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [course]);

  useEffect(() => {
    if (!course || busy) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const data = await api(`/manage/versions?course_id=${encodeURIComponent(course)}`);
        if (!active) return;
        setVersions(data.items);
        setPreview(previous => {
          if (!previous) return previous;
          const updated = data.items.find((v: Version) => v.version_id === previous.version.version_id);
          return updated ? { ...previous, version: { ...previous.version, state: updated.state, is_current: updated.is_current, emergency_locked: updated.emergency_locked, chunk_count: updated.chunk_count, embedded_count: updated.embedded_count, job: updated.job } } : previous;
        });
      } catch {}
    }, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [course, busy]);

  async function refresh() { if (course) setVersions((await api(`/manage/versions?course_id=${encodeURIComponent(course)}`)).items); }
  async function open(id: string, p = 1) {
    if (!viewer) { window.location.assign(`/hub/review?course=${encodeURIComponent(course)}&version=${encodeURIComponent(id)}`); return; }
    const d: Preview = await api(`/review/versions/${id}/preview?page_from=${p}&page_to=${p}`);
    setPreview(d); setMeta({ ...empty, ...d.version, authors: d.version.authors || "", chapter: d.version.chapter || "" }); setPage(p); setAck(false); setReason(""); setFile(null); setNewDocument(null);
    setShowWithdraw(false);
    setWithdrawReason("");
    // Also reveal details when opening a version automatically from the review URL.
    setListOpen(false);
  }
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra"); } finally { setBusy(false); } }
  async function upload() {
    if (!file || !course) throw new Error("Hãy chọn môn và file PDF/PPTX.");
    const body = new FormData(); body.set("course_id", course); body.set("metadata", JSON.stringify(meta)); body.set("file", file);
    const d = await api(newDocument ? `/documents/${newDocument}/versions` : "/documents", { method: "POST", body });
    await refresh(); await open(d.version_id); setNotice("File đã được lưu và đang trích xuất. Bấm Tải lại để kiểm tra; chưa được phát hành.");
  }
  async function action(name: string, body: unknown) { if (!preview) return; await api(`/versions/${preview.version.version_id}/${name}`, json("POST", body)); await refresh(); await open(preview.version.version_id); setNotice("Đã cập nhật. Chỉ trạng thái Published mới phục vụ Chat AI."); }
  function field(key: keyof Meta, value: unknown) { setMeta(m => ({ ...m, [key]: value })); }

  const filteredVersions = useMemo(() => versions.filter(v => {
    const matchQuery = !query.trim() || `${v.title} ${v.version_label}`.toLowerCase().includes(query.toLowerCase());
    const matchState = filterState === "All" || v.state === filterState || (filterState === "Processing" && ["Processing", "Approved", "Indexing"].includes(v.state)) || (filterState === "Failed" && isAttention(v.state));
    return matchQuery && matchState;
  }), [versions, query, filterState]);
  const stats = useMemo(() => ({ total: versions.length, pending: versions.filter(v => v.state === "PendingApproval").length, processing: versions.filter(v => ["Processing", "Approved", "Indexing"].includes(v.state)).length, attention: versions.filter(v => isAttention(v.state)).length }), [versions]);

  useEffect(() => {
    if (query.trim()) setListOpen(true);
  }, [query]);

  const softInput = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";
  const ghostButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-40";

  // D-59: nằm trong khung chung MainShell (thanh bên Hỏi đáp / Quản lý tài liệu / Câu hỏi trắc nghiệm) — bỏ thanh bên và
  // header riêng; bộ lọc trạng thái thành hàng nút ngay trên nội dung.
  return <main className="lecturer-hub h-full overflow-y-auto bg-[#f6f9fd] text-slate-950 font-sans">
      <section className="min-w-0">
        <div className="mx-auto max-w-[1900px] space-y-4 p-4 xl:px-9 xl:py-5">
          <nav aria-label="Lọc tài liệu" className="flex flex-wrap gap-2 text-[14px] font-medium">
          {[
            { label: "Dashboard", filter: "Dashboard", count: 0, icon: Activity },
            { label: viewer ? "Xem và duyệt tài liệu" : "Quản lý tài liệu", filter: "All", count: stats.total, icon: FileText },
            { label: "Bản nháp", filter: "Draft", count: versions.filter(v => v.state === "Draft").length, icon: FileText },
            { label: "Chờ duyệt", filter: "PendingApproval", count: stats.pending, icon: Clock3 },
            { label: "Đang xử lý", filter: "Processing", count: stats.processing, icon: Settings2 },
            { label: "Đã phát hành", filter: "Published", count: versions.filter(v => v.state === "Published").length, icon: CheckCircle2 },
            { label: "Cần chú ý", filter: "Failed", count: stats.attention, icon: AlertCircle },
          ].map((item) => {
            const active = activeMenu === item.label;
            return (
              <button
                key={item.label}
                onClick={() => { setActiveMenu(item.label); setFilterState(item.filter); setListOpen(true); }}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors", active ? "border-blue-200 bg-blue-50 text-blue-700 font-semibold" : "border-slate-200 bg-white hover:bg-slate-100 text-slate-600")}
              >
                <item.icon size={17} className="shrink-0" />
                <span>{item.label}</span>
                {item.label !== "Dashboard" && (
                  <span className={cn("min-w-6 shrink-0 rounded-lg px-1.5 py-0.5 text-center text-xs font-bold tabular-nums", active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>{item.count}</span>
                )}
              </button>
            );
          })}
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-bold tracking-tight">
                {activeMenu === "Dashboard" ? "Dashboard Giảng Viên" : viewer ? "Xem và duyệt tài liệu" : "Thêm tài liệu mới"}
              </h1>
              <p className="mt-2 text-slate-600">
                {activeMenu === "Dashboard" 
                  ? "Theo dõi tổng quan tình hình sử dụng, đánh giá và giải quyết các phản hồi từ sinh viên." 
                  : "Quản lý các phiên bản, xem trước, duyệt và theo dõi trạng thái tài liệu trong Hub."}
              </p>
            </div>
            {canUpload && activeMenu !== "Dashboard" && <button onClick={() => { if (viewer) window.location.assign(`/hub/manage?course=${encodeURIComponent(course)}`); else { setPreview(null); setMeta({ ...empty }); setFile(null); setNewDocument(null); setListOpen(false); } }} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"><Upload size={18} />Tải tài liệu mới</button>}
          </div>

          {activeMenu !== "Dashboard" && (
            <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {flow.map((s, i) => <div key={s.label} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold", i === currentStep ? "bg-blue-50 text-blue-700" : i < currentStep ? "text-slate-700" : "text-slate-500")}>{i < currentStep ? <Check size={17} /> : <s.icon size={17} className={s.icon === Loader2 && i === currentStep ? "animate-spin" : ""} />}{s.label}{i < flow.length - 1 && <ChevronRight size={16} className="ml-2 text-slate-300" />}</div>)}
            </div>
          )}

          {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 font-medium text-red-700">{error}</p>}
          {notice && <p role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 font-medium text-blue-800">{notice}</p>}
          {loading ? <p className="rounded-2xl bg-white p-6">Đang tải quyền truy cập…</p> : !courses.length ? <p className="rounded-2xl bg-white p-6">Bạn chưa được cấp quyền quản lý hoặc duyệt môn học.</p> : <>
            <div className="flex flex-wrap items-center gap-3 text-xs"><select aria-label="Môn quản lý" className={cn(softInput, "max-w-[240px] !py-1 !text-xs")} value={course} disabled={busy} onChange={e => setCourse(e.target.value)}>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className={cn(ghostButton, "!py-1 !text-xs")} disabled={busy} onClick={() => run(async () => { await refresh(); if (preview) await open(preview.version.version_id, page); })}><RefreshCw size={16} className={busy ? "animate-spin" : ""} />Tải lại trạng thái</button></div>

            {activeMenu === "Dashboard" ? (
              <div className="mt-4 animate-in fade-in zoom-in-95 duration-200">
                <LecturerDashboard courseId={course} />
              </div>
            ) : listOpen ? (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all animate-in fade-in zoom-in-95 duration-200">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <h2 className="text-[17px] font-bold">Danh sách tài liệu</h2>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-400 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 transition-all"><Search size={16} /><input className="w-56 bg-transparent text-sm outline-none" placeholder="Tìm tài liệu..." value={query} onChange={e => setQuery(e.target.value)} /></div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 overflow-y-auto pr-2 pb-2">
                  {!filteredVersions.length && <p className="col-span-full py-8 text-center text-sm text-slate-500">Chưa có tài liệu.</p>}
                  {filteredVersions.map((v, idx) => <button key={v.version_id} disabled={busy} onClick={() => run(() => open(v.version_id))} className={cn("flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition", preview?.version.version_id === v.version_id ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")}>
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl font-bold", preview?.version.version_id === v.version_id ? "bg-blue-200/50 text-blue-700" : "bg-slate-100 text-slate-600")}>{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <strong className="line-clamp-2 text-sm font-semibold">{v.title || "Chưa có tiêu đề"}</strong>
                      <p className="mt-1 text-xs text-slate-500">Phiên bản {v.version_label} · {shortDate((v as unknown as { published_at?: string }).published_at)}</p>
                      <div className="mt-3"><StatusBadge state={v.state} /></div>
                      <ProcessingStatus version={v} compact />
                    </div>
                  </button>)}
                </div>
              </section>
            ) : (
              <div className={cn("grid items-start gap-5 animate-in fade-in slide-in-from-bottom-4 duration-300", viewer ? "hub-review-grid xl:grid-cols-[1.2fr_1fr]" : "xl:grid-cols-1")}>
                {viewer && <section className="hub-preview flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600"><FileText /></div><div><h2 className="font-bold">{preview?.version.title || "Chọn tài liệu để xem"}</h2><p className="text-sm text-slate-500">Bản gốc thực tế · {preview?.version.page_count || 0} trang · Chỉ xem, không chỉnh sửa trực tiếp file</p></div></div>{originalUrl && <div className="hub-preview-actions flex shrink-0 flex-wrap gap-2"><a className={ghostButton} href={originalUrl} download><Download size={16} />Tải xuống</a><a className={ghostButton} href={originalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Mở ở tab riêng</a></div>}</header>
                  {originalError && <p role="alert" className="p-6 text-red-600">{originalError}</p>}
                  {selectedVersion && !originalUrl && !originalError && <p className="p-6" role="status">Đang tải bản gốc…</p>}
                  {originalUrl && preview?.version.file_type === "pdf" && <iframe title="Bản PDF gốc" src={`${originalUrl}#page=${page}`} className="min-h-0 w-full flex-1 border-0 bg-white" />}
                  {originalUrl && preview?.version.file_type !== "pdf" && <div className="p-8"><p>Trình duyệt không xem trực tiếp PPTX. Xem text theo slide ở bên phải hoặc tải file để mở bằng PowerPoint.</p><a className="mt-3 inline-block text-blue-600 underline" href={originalUrl} download>Tải bản gốc để kiểm tra</a></div>}
                </section>}

                <section aria-label="Chi tiết và quản lý phiên bản" tabIndex={viewer ? 0 : undefined} className="hub-details min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                  {viewer && <h2 className="mb-4 text-sm font-bold">Chi tiết phiên bản</h2>}
                  <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm leading-6 font-bold">{preview ? `${preview.version.title} · Phiên bản ${preview.version.version_label}` : newDocument ? "Tạo phiên bản mới" : "Tải lên bản nháp"}</h2>{preview && <p className="mt-1 text-sm text-slate-500">Lần sửa {preview.version.revision}</p>}</div>{preview && <StatusBadge state={preview.version.state} />}</div>
                  {preview && <DocumentStatus state={preview.version.state} current={preview.version.is_current} locked={preview.version.emergency_locked} />}
                  {preview && <ProcessingStatus version={preview.version} />}
                  {preview?.version.state === "Failed" && <button className={ghostButton} disabled={busy} onClick={() => run(() => action("retry", {}))}><RefreshCw size={16} />Thử lại xử lý</button>}
                  {preview?.version.state === "Published" && preview.version.is_current && !preview.version.emergency_locked && <Link href={`/?document=${encodeURIComponent(preview.version.document_id)}&title=${encodeURIComponent(preview.version.title)}`} className="my-3 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Hỏi AI về tài liệu này</Link>}
                  {preview?.version.reject_reason && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">Lý do từ chối: {preview.version.reject_reason}</p>}
                  {!preview && canUpload && <label className="mt-4 block rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center text-sm font-semibold text-blue-700"><Upload className="mx-auto mb-2" />Chọn file PDF/PPTX<input key={`${course}-${newDocument}`} type="file" accept=".pdf,.pptx" disabled={busy} className="sr-only" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !meta.title) field("title", f.name); }} />{file && <span className="mt-2 block text-slate-700">{file.name}</span>}</label>}
                  {preview && !editable && <p className="my-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Thông tin bên dưới chỉ đọc ở trạng thái này. Để thay nội dung bản phát hành, hãy tạo phiên bản mới.</p>}

                  {preview && <div className="my-5 space-y-3 text-sm"><h3 className="font-bold">Thông tin tài liệu</h3><p className="flex justify-between text-slate-600"><span>Số trang</span><span>{preview.version.page_count}</span></p><p className="flex justify-between text-slate-600"><span>Định dạng</span><span>{preview.version.file_type.toUpperCase()}</span></p><p className="flex justify-between text-slate-600"><span>Phiên bản</span><span>{preview.version.version_label}</span></p></div>}
                  <details open={!preview || editable} className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Metadata và thao tác quản lý</summary>
                  <fieldset disabled={!editable || busy} className={cn("mt-5 grid gap-3", viewer ? "" : "md:grid-cols-2")}>
                    {([ ["title", "Tiêu đề"], ["version_label", "Phiên bản"], ["authors", "Tác giả"], ["provenance", "Nguồn gốc / giấy phép"], ["chapter", "Chương / chủ đề"] ] as const).map(([key, label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input className={cn(softInput, "mt-1")} value={meta[key]} onChange={e => field(key, e.target.value)} /></label>)}
                    <label className="text-sm font-medium text-slate-700">Loại tài liệu<select className={cn(softInput, "mt-1")} value={meta.doc_type} onChange={e => field("doc_type", e.target.value)}>{["textbook", "slide", "exercise", "reference", "syllabus", "other"].map(t => <option key={t}>{t}</option>)}</select></label>
                    <label className="text-sm font-medium text-slate-700">Nhãn liêm chính<select className={cn(softInput, "mt-1")} value={meta.integrity_label} onChange={e => field("integrity_label", e.target.value)}>{["learning_material", "exercise_ungraded", "exercise_graded", "answer_key"].map(t => <option key={t}>{t}</option>)}</select></label>
                    <label className="text-sm font-medium text-slate-700">Quyền sử dụng<select className={cn(softInput, "mt-1")} value={meta.usage_permission} onChange={e => field("usage_permission", e.target.value)}><option value="pending">Chưa xác nhận</option><option value="confirmed">Tôi xác nhận quyền sử dụng</option></select></label>
                    <div className="text-sm font-medium text-slate-700">Đối tượng đọc{["student", "lecturer", "reviewer"].map(r => <label key={r} className="mt-2 flex items-center gap-2 font-normal"><input type="checkbox" checked={meta.acl_roles.includes(r)} onChange={e => field("acl_roles", e.target.checked ? [...meta.acl_roles, r] : meta.acl_roles.filter(x => x !== r))} /> {r}</label>)}</div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={meta.download_allowed} onChange={e => field("download_allowed", e.target.checked)} /> Cho tải bản gốc</label>
                  </fieldset>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {!preview && canUpload && <button className={ghostButton} disabled={busy || !file || !meta.title || !meta.provenance || !meta.version_label} onClick={() => run(upload)}><Upload size={16} />Tải lên & trích xuất</button>}
                    {preview && editable && <button className={ghostButton} disabled={busy} onClick={() => run(async () => { await api(`/versions/${preview.version.version_id}`, json("PATCH", { expected_revision: preview.version.revision, metadata: meta })); await refresh(); await open(preview.version.version_id); setNotice("Đã lưu metadata."); })}><ShieldCheck size={16} />Lưu metadata</button>}
                    {preview?.can_edit && <button className={ghostButton} disabled={busy} onClick={() => { setNewDocument(preview.version.document_id); setMeta(m => ({ ...m, version_label: "" })); setPreview(null); setFile(null); setListOpen(false); }}>Tải file thành phiên bản mới</button>}
                    {preview?.can_edit && ["Draft", "NeedsReview", "Rejected"].includes(preview.version.state) && <button className={ghostButton} disabled={busy || (preview.version.quality_warnings.length > 0 && !ack)} onClick={() => run(() => action("submit", { acknowledge_warnings: ack }))}><Send size={16} />Gửi duyệt bản đã lưu</button>}
                    {preview?.can_edit && preview.version.state === "Published" && <button className={cn(ghostButton, "text-red-600 hover:bg-red-50 border-red-200")} disabled={busy} onClick={() => setShowWithdraw(!showWithdraw)}>Thu hồi tài liệu</button>}
                  </div>

                  {showWithdraw && (
                    <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-xl">
                      <h3 className="font-bold text-red-700 mb-2">Thu hồi tài liệu</h3>
                      <p className="text-sm text-red-600 mb-3">Tài liệu sẽ bị gỡ khỏi Hub và Chat AI. Vui lòng nhập lý do:</p>
                      <input className={softInput} value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} placeholder="Lý do thu hồi..." />
                      <div className="flex gap-2 mt-3">
                        <button className={cn(ghostButton, "bg-red-600 text-white hover:bg-red-700 border-transparent")} disabled={busy || !withdrawReason.trim()} onClick={() => run(async () => {
                          await action("withdraw", { reason: withdrawReason });
                          setShowWithdraw(false);
                          setWithdrawReason("");
                        })}>Xác nhận thu hồi</button>
                        <button className={ghostButton} onClick={() => setShowWithdraw(false)}>Hủy</button>
                      </div>
                    </div>
                  )}

                  {preview && <div className="mt-6 space-y-4">
                    {!!preview.version.quality_warnings.length && <div className="rounded-xl bg-amber-50 p-4 text-sm"><p className="font-semibold text-amber-800">Cảnh báo chất lượng:</p><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.version.quality_warnings, null, 2)}</pre><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> Tôi đã kiểm tra các cảnh báo</label></div>}
                    <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-bold">Text trích xuất · Trang {page}</h3><button className={ghostButton} disabled={busy || page <= 1} onClick={() => run(() => open(preview.version.version_id, page - 1))}>Trước</button><button className={ghostButton} disabled={busy || page >= (preview.version.page_count || 0)} onClick={() => run(() => open(preview.version.version_id, page + 1))}>Sau</button></div>
                    <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{preview.pages.map(p => p.text).join("\n\n") || "Chưa có text ở trang này. Nếu đang xử lý, hãy tải lại sau."}</div>
                    {preview.can_decide && preview.version.state === "PendingApproval" && <div className="space-y-3 rounded-2xl border border-slate-200 p-4"><h3 className="font-bold">Quyết định duyệt</h3><textarea aria-label="Lý do quyết định" className={softInput} placeholder="Lý do (bắt buộc khi từ chối)" value={reason} onChange={e => setReason(e.target.value)} /><div className="flex gap-2"><button className={cn(ghostButton, "border-emerald-200 bg-emerald-50 text-emerald-700")} disabled={busy} onClick={() => run(() => action("decision", { decision: "approve", reason, reviewed_revision: preview.version.revision }))}><CheckCircle2 size={16} />Duyệt & lập chỉ mục</button><button className={cn(ghostButton, "border-red-200 bg-red-50 text-red-700")} disabled={busy || !reason.trim()} onClick={() => run(() => action("decision", { decision: "reject", reason, reviewed_revision: preview.version.revision }))}><XCircle size={16} />Từ chối</button></div></div>}
                  </div>}
                  </details>
                </section>
              </div>
            )}
          </>}
        </div>
      </section>
  </main>;
}
