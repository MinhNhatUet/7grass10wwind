"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DocumentStatus, StatusBadge } from "./document-status";

const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1`;
type Course = { id: string; name: string; can_upload: boolean; can_review: boolean };
type Meta = { title: string; doc_type: string; version_label: string; authors: string; provenance: string; usage_permission: string; acl_roles: string[]; download_allowed: boolean; integrity_label: string; chapter: string };
type Version = Meta & { file_type: string; is_current: boolean; emergency_locked: boolean; version_id: string; document_id: string; revision: number; state: string; page_count: number; quality_warnings: unknown[]; reject_reason?: string };
type Preview = { version: Version; can_edit: boolean; can_decide: boolean; pages: { locator: { value: number }; text: string }[] };
const empty: Meta = { title: "", doc_type: "textbook", version_label: "1", authors: "", provenance: "", usage_permission: "pending", acl_roles: ["lecturer", "reviewer"], download_allowed: false, integrity_label: "learning_material", chapter: "" };
async function api(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem("token");
  if (!token) { window.location.replace("/login"); throw new Error("Vui lòng đăng nhập"); }
  const r = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (r.status === 401) { window.location.replace("/login"); throw new Error("Phiên đã hết hạn"); }
  const data = await r.json();
  if (!r.ok) throw new Error(r.status === 409 ? "Dữ liệu đã thay đổi hoặc file trùng. Hãy tải lại trước khi tiếp tục." : `Thao tác thất bại: ${data.error?.code || data.detail || r.status}`);
  return data;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export default function ManageHub({ viewer = false }: { viewer?: boolean }) {
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
  const selectedVersion = preview?.version.version_id;
  useEffect(() => {
    if (!viewer || !selectedVersion) return;
    const controller = new AbortController();
    let objectUrl = "";
    setOriginalUrl(""); setOriginalError("");
    fetch(`${API}/review/versions/${selectedVersion}/original`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Không thể mở bản gốc hoặc bạn không còn quyền xem.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setOriginalUrl(objectUrl);
    }).catch(e => { if (!controller.signal.aborted) setOriginalError(e.message); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [viewer, selectedVersion]);
  const canUpload = !!courses.find(c => c.id === course)?.can_upload;
  const editable = !preview ? canUpload : preview.can_edit && ["Draft", "NeedsReview", "Rejected", "PendingApproval"].includes(preview.version.state);
  useEffect(() => {
    api("/me/courses").then(d => { const rows = d.items.filter((c: Course) => c.can_upload || c.can_review); setCourses(rows); const requested = new URLSearchParams(window.location.search).get('course'); setCourse(rows.find((c: Course) => c.id === requested)?.id || rows[0]?.id || ""); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!course) return;
    let active = true;
    setVersions([]); setPreview(null); setMeta({ ...empty }); setFile(null); setNewDocument(null);
    api(`/manage/versions?course_id=${encodeURIComponent(course)}`).then(d => { if (active) {
      setVersions(d.items);
      if (viewer) {
        const requested = new URLSearchParams(window.location.search).get('version');
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
          return updated ? { ...previous, version: { ...previous.version, state: updated.state, is_current: updated.is_current, emergency_locked: updated.emergency_locked } } : previous;
        });
      } catch { /* Manual refresh surfaces errors; do not discard an in-progress form. */ }
    }, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [course, busy]);
  async function refresh() { if (course) setVersions((await api(`/manage/versions?course_id=${encodeURIComponent(course)}`)).items); }
  async function open(id: string, p = 1) {
    if (!viewer) {
      window.location.assign(`/hub/review?course=${encodeURIComponent(course)}&version=${encodeURIComponent(id)}`);
      return;
    }
    const d: Preview = await api(`/review/versions/${id}/preview?page_from=${p}&page_to=${p}`);
    setPreview(d); setMeta({ ...empty, ...d.version, authors: d.version.authors || "", chapter: d.version.chapter || "" }); setPage(p); setAck(false); setReason(""); setFile(null); setNewDocument(null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra"); } finally { setBusy(false); }
  }
  async function upload() {
    if (!file || !course) throw new Error("Hãy chọn môn và file PDF/PPTX.");
    const body = new FormData(); body.set("course_id", course); body.set("metadata", JSON.stringify(meta)); body.set("file", file);
    const d = await api(newDocument ? `/documents/${newDocument}/versions` : "/documents", { method: "POST", body });
    await refresh(); await open(d.version_id); setNotice("File đã được lưu và đang trích xuất. Bấm Tải lại để kiểm tra; chưa được phát hành.");
  }
  async function action(name: string, body: unknown) {
    if (!preview) return;
    await api(`/versions/${preview.version.version_id}/${name}`, json("POST", body));
    await refresh(); await open(preview.version.version_id); setNotice("Đã cập nhật. Chỉ trạng thái Published mới phục vụ Chat AI.");
  }
  function field(key: keyof Meta, value: unknown) { setMeta(m => ({ ...m, [key]: value })); }
  const input = "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent p-2 text-sm";
  const button = "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-40";
  return <main style={{ fontFamily: 'Arial, Helvetica, sans-serif' }} className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-8">
    <div className={`mx-auto ${viewer ? 'max-w-[1800px]' : 'max-w-7xl'} space-y-4`}>
      <nav className="flex gap-4 text-sm text-blue-600"><Link href="/">← Chat AI</Link><Link href="/hub">Thư viện Hub</Link><Link href="/profile">Hồ sơ</Link></nav>
      <h1 className="text-2xl font-bold">{viewer ? 'Hub · Xem và duyệt tài liệu' : 'Thêm tài liệu mới'}</h1>
      <p className="text-sm text-slate-500">Bản nháp → Xem trước / sửa metadata → Gửi duyệt → Indexing → Published</p>
      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">{error}</p>}
      {notice && <p role="status" className="p-3 bg-blue-50 text-blue-800 rounded-lg">{notice}</p>}
      {loading ? <p>Đang tải quyền truy cập…</p> : !courses.length ? <p>Bạn chưa được cấp quyền quản lý hoặc duyệt môn học.</p> : <>
      <div className="flex flex-wrap gap-3"><select aria-label="Môn quản lý" className={input + " max-w-sm"} value={course} disabled={busy} onChange={e => setCourse(e.target.value)}>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className={button} disabled={busy} onClick={() => run(async () => { await refresh(); if (preview) await open(preview.version.version_id, page); })}>Tải lại trạng thái</button>
      {canUpload && <button className={button} disabled={busy} onClick={() => { if (viewer) { window.location.assign(`/hub/manage?course=${encodeURIComponent(course)}`); return; } setPreview(null); setMeta({ ...empty }); setFile(null); setNewDocument(null); setNotice(""); }}>+ Tài liệu mới</button>}</div>
      <p className="text-xs text-slate-500">Trạng thái tự cập nhật mỗi 10 giây. Dùng “Tải lại trạng thái” để lấy lại cả nội dung và metadata đã lưu.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[['Tổng phiên bản', versions.length], ['Chờ duyệt', versions.filter(v => v.state === 'PendingApproval').length], ['Đang xử lý', versions.filter(v => ['Processing','Approved','Indexing'].includes(v.state)).length], ['Cần chú ý', versions.filter(v => ['Failed','Rejected','NeedsReview'].includes(v.state)).length]].map(([label,count]) => <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"><p className="text-xs text-slate-500">{label}</p><strong className="text-2xl">{count}</strong></div>)}</div>
      <div className={`grid gap-5 ${viewer ? 'xl:grid-cols-[240px_minmax(0,1fr)_380px]' : 'lg:grid-cols-[280px_1fr]'}`}>
        <aside className="space-y-2">{!versions.length && <p className="text-sm">Chưa có tài liệu.</p>}{versions.map(v => <button key={v.version_id} disabled={busy} onClick={() => run(() => open(v.version_id))} className={button + " block w-full text-left " + (preview?.version.version_id === v.version_id ? " bg-blue-100 dark:bg-blue-950" : "")}><strong className="block">{v.title}</strong><span className="block text-xs my-2">Phiên bản {v.version_label}</span><StatusBadge state={v.state} /></button>)}</aside>
        {viewer && <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-900 overflow-hidden">
          <header className="p-3 bg-white dark:bg-slate-900 border-b dark:border-slate-700"><h2 className="font-semibold">{preview?.version.title || 'Chọn tài liệu để xem'}</h2><p className="text-xs text-slate-500">Bản gốc thực tế · {preview?.version.page_count || 0} trang · Chỉ xem, không chỉnh sửa trực tiếp file</p></header>
          {originalError && <p role="alert" className="p-4 text-red-600">{originalError}</p>}
          {selectedVersion && !originalUrl && !originalError && <p className="p-4" role="status">Đang tải bản gốc…</p>}
          {originalUrl && preview?.version.file_type === 'pdf' && <iframe title="Bản PDF gốc" src={`${originalUrl}#page=${page}`} className="w-full h-[80vh] border-0" />}
          {originalUrl && preview?.version.file_type !== 'pdf' && <div className="p-6 space-y-3"><p>Trình duyệt không xem trực tiếp PPTX. Xem text theo slide ở bên phải hoặc tải file để mở bằng PowerPoint.</p><a className="text-blue-600 underline" href={originalUrl} download>Tải bản gốc để kiểm tra</a></div>}
          {originalUrl && preview?.version.file_type === 'pdf' && <a className="block p-3 text-sm text-blue-600" href={originalUrl} target="_blank" rel="noreferrer">Mở PDF ở tab riêng nếu trình duyệt không hiển thị</a>}
        </section>}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 bg-white dark:bg-slate-900">
          <h2 className="font-semibold">{preview ? `${preview.version.title} · Phiên bản ${preview.version.version_label} · Lần sửa ${preview.version.revision}` : newDocument ? "Tạo phiên bản mới" : "Tải lên bản nháp"}</h2>
          {preview && <DocumentStatus state={preview.version.state} current={preview.version.is_current} locked={preview.version.emergency_locked} />}
          {preview && !editable && <p className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-sm">Thông tin bên dưới chỉ đọc ở trạng thái này. Để thay nội dung bản phát hành, hãy tạo phiên bản mới.</p>}
          {preview?.version.reject_reason && <p className="text-red-600">Lý do từ chối: {preview.version.reject_reason}</p>}
          {!preview && canUpload && <label className="block text-sm">File PDF/PPTX<input key={`${course}-${newDocument}`} type="file" accept=".pdf,.pptx" disabled={busy} className="block mt-2" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !meta.title) field("title", f.name); }} /></label>}
          <fieldset disabled={!editable || busy} className={`grid gap-3 ${viewer ? '' : 'sm:grid-cols-2'}`}>
            {([['title','Tiêu đề'],['version_label','Phiên bản'],['authors','Tác giả'],['provenance','Nguồn gốc / giấy phép'],['chapter','Chương / chủ đề']] as const).map(([key,label]) => <label key={key} className="text-sm">{label}<input className={input} value={meta[key]} onChange={e => field(key,e.target.value)} /></label>)}
            <label className="text-sm">Loại tài liệu<select className={input} value={meta.doc_type} onChange={e => field('doc_type', e.target.value)}>{['textbook','slide','exercise','reference','syllabus','other'].map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="text-sm">Nhãn liêm chính<select className={input} value={meta.integrity_label} onChange={e => field('integrity_label',e.target.value)}>{['learning_material','exercise_ungraded','exercise_graded','answer_key'].map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="text-sm">Quyền sử dụng<select className={input} value={meta.usage_permission} onChange={e => field('usage_permission',e.target.value)}><option value="pending">Chưa xác nhận</option><option value="confirmed">Tôi xác nhận quyền sử dụng</option></select></label>
            <div className="text-sm">Đối tượng đọc{['student','lecturer','reviewer'].map(r => <label key={r} className="block"><input type="checkbox" checked={meta.acl_roles.includes(r)} onChange={e => field('acl_roles',e.target.checked ? [...meta.acl_roles,r] : meta.acl_roles.filter(x => x !== r))} /> {r}</label>)}</div>
            <label className="text-sm"><input type="checkbox" checked={meta.download_allowed} onChange={e => field('download_allowed',e.target.checked)} /> Cho tải bản gốc</label>
          </fieldset>
          <p className="text-xs text-slate-500">Chỉnh sửa ở đây chỉ cập nhật metadata, không sửa nội dung PDF/PPTX. Để thay nội dung, chỉnh file bằng công cụ soạn thảo rồi tải thành phiên bản mới.</p>
          <div className="flex flex-wrap gap-2">
            {!preview && canUpload && <button className={button} disabled={busy || !file || !meta.title || !meta.provenance || !meta.version_label} onClick={() => run(upload)}>Tải lên & trích xuất</button>}
            {preview && editable && <button className={button} disabled={busy} onClick={() => run(async () => { await api(`/versions/${preview.version.version_id}`, json('PATCH',{ expected_revision: preview.version.revision, metadata: meta })); await refresh(); await open(preview.version.version_id); setNotice('Đã lưu metadata.'); })}>Lưu metadata</button>}
            {preview?.can_edit && <button className={button} disabled={busy} onClick={() => { setNewDocument(preview.version.document_id); setMeta(m => ({ ...m, version_label: '' })); setPreview(null); setFile(null); }}>Tải file thành phiên bản mới</button>}
            {preview?.can_edit && ['Draft','NeedsReview','Rejected'].includes(preview.version.state) && <button className={button} disabled={busy || (preview.version.quality_warnings.length > 0 && !ack)} onClick={() => run(() => action('submit',{acknowledge_warnings:ack}))}>Gửi duyệt bản đã lưu</button>}
            {preview?.version.state === 'Failed' && <button className={button} disabled={busy} onClick={() => run(() => action('retry',{}))}>Thử lại xử lý</button>}
          </div>
          {preview && <>
            {!!preview.version.quality_warnings.length && <div className="text-sm"><p>Cảnh báo chất lượng:</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.version.quality_warnings,null,2)}</pre><label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> Tôi đã kiểm tra các cảnh báo</label></div>}
            <div className="flex items-center gap-2"><h3 className="font-semibold">Text trích xuất · Trang {page}</h3><button className={button} disabled={busy || page <= 1} onClick={() => run(() => open(preview.version.version_id,page-1))}>Trước</button><button className={button} disabled={busy || page >= (preview.version.page_count || 0)} onClick={() => run(() => open(preview.version.version_id,page+1))}>Sau</button></div>
            <div className="max-h-96 overflow-auto whitespace-pre-wrap text-sm rounded-lg bg-slate-50 dark:bg-slate-950 p-4">{preview.pages.map(p => p.text).join('\n\n') || 'Chưa có text ở trang này. Nếu đang xử lý, hãy tải lại sau.'}</div>
            {preview.can_decide && preview.version.state === 'PendingApproval' && <div className="space-y-2 border-t pt-4"><h3 className="font-semibold">Quyết định duyệt</h3><textarea aria-label="Lý do quyết định" className={input} placeholder="Lý do (bắt buộc khi từ chối)" value={reason} onChange={e => setReason(e.target.value)} /><div className="flex gap-2">{['approve','reject'].map(d => <button key={d} className={button} disabled={busy || (d === 'reject' && !reason.trim())} onClick={() => run(() => action('decision',{decision:d,reason,reviewed_revision:preview.version.revision}))}>{d === 'approve' ? 'Duyệt & lập chỉ mục' : 'Từ chối'}</button>)}</div></div>}
          </>}
        </section>
      </div></>}
    </div>
  </main>;
}
