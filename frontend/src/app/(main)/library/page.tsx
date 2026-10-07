"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Layers, LayoutGrid, List, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import type { SourceReference } from "@/components/source-reader";
import ScrollDocumentReader from "@/components/scroll-document-reader";
import { API, authHeaders, responseError } from "@/lib/api-errors";
import { downloadFile } from "@/lib/api";
import { DOC_TYPE_LABEL } from "@/lib/messages";
import "./library.css";

// /me/courses already returns only courses readable by the current user.
type Course = { id: string; name: string; code?: string | null };
type Document = {
  document_id: string; version_id: string; title: string; version_label: string; page_count: number;
  doc_type?: string | null; file_type?: string | null; published_at?: string | null; can_download?: boolean; snippet?: string | null;
};
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const PAGE_SIZE = 20;
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
const askHref = (d: Document) => `/?document=${encodeURIComponent(d.document_id)}&title=${encodeURIComponent(d.title)}`;

// Ô chọn của bộ lọc (Môn học / Loại tài liệu): nhãn nhỏ + giá trị đang chọn, bấm vào là danh sách để chọn
const filterBox = "flex cursor-pointer flex-col justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm transition hover:border-slate-400 focus-within:border-slate-400";

export default function Library() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState("");
  const [docType, setDocType] = useState(""); // "" = mọi loại; lọc ở server (tham số doc_type)
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [source, setSource] = useState<SourceReference | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false); // chọn tài liệu khác ngay trên thanh đang đọc
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const loading = coursesLoading || documentsLoading;
  const current = courses.find(c => c.id === course);
  const courseCode = current?.code || current?.id || "";
  const selectedDocument = documents.find(d => d.version_id === source?.versionId);
  const pickerDocs = documents.filter(d => !pickerQuery.trim() || d.title.toLowerCase().includes(pickerQuery.trim().toLowerCase()));

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerOpen]);

  useEffect(() => {
    if (source) document.getElementById("library-detail")?.scrollIntoView({ block: "start" });
  }, [source]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoursesLoading(true); setError("");
    fetch(`${API}/me/courses`, { headers: authHeaders(), signal: controller.signal, cache: "no-store" })
      .then(async r => { if (!r.ok) throw await responseError(r); return r.json(); })
      .then(d => {
        if (controller.signal.aborted) return;
        const rows = d.items as Course[];
        setCourses(rows); setCourse(current => rows.some(c => c.id === current) ? current : rows[0]?.id || "");
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setCoursesLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!course || coursesLoading) return;
    const controller = new AbortController();
    // Reset protected results before fetching a different course/filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocumentsLoading(true); setDocuments([]); setTotal(0); setSource(null);
    const params = new URLSearchParams({ course_id: course, q: query, page: String(page), page_size: String(PAGE_SIZE) });
    if (docType) params.set("doc_type", docType);
    const timer = setTimeout(() => {
      fetch(`${API}/documents?${params}`, { headers: authHeaders(), signal: controller.signal, cache: "no-store" })
        .then(async r => { if (!r.ok) throw await responseError(r); return r.json(); })
        .then(d => { if (!controller.signal.aborted) { setDocuments(d.items); setTotal(d.total); } })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setDocumentsLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [course, docType, query, page, coursesLoading]);

  function resetResults() { setPage(1); setError(""); setSource(null); setDocuments([]); setTotal(0); }
  function changeCourse(value: string) { setCourse(value); resetResults(); }
  function changeDocType(value: string) { setDocType(value); resetResults(); }
  function changeQuery(value: string) { setQuery(value); resetResults(); }
  function refresh() { setSource(null); setDocuments([]); setTotal(0); setDocumentsLoading(false); setAttempt(n => n + 1); }
  function open(d: Document) { setSource({ documentId: d.document_id, versionId: d.version_id, page: 1 }); }
  async function download(d: Document) {
    setDownloading(true);
    try {
      await downloadFile(`/documents/${d.document_id}/versions/${d.version_id}/download`, `${d.title}.${d.file_type || "pdf"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được tài liệu.");
    } finally {
      setDownloading(false);
    }
  }

  const typeLabel = (d: Document) => DOC_TYPE_LABEL[d.doc_type ?? ""] ?? "Tài liệu";

  return <div className="library-page h-full overflow-y-auto bg-[#f8f9fa] text-slate-900">
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Thư viện của bạn</p><h1 className="text-3xl font-bold tracking-tight">Tài liệu học tập</h1><p className="mt-2 text-sm leading-6 text-slate-500">Học liệu đã phát hành trong các môn bạn được đọc — xem trực tuyến hoặc hỏi trợ lý về từng tài liệu.</p></div>
        <button onClick={refresh} disabled={loading} className={button}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Tải lại</button>
      </div>

      {/* Bộ lọc: 2 ô chọn (Môn học, Loại tài liệu) + tìm kiếm; đang đọc → ẩn để khung đọc rộng */}
      {!source && <div className="grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,13rem)_1fr]">
        <label className={filterBox}>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Môn học</span>
          <span className="relative block">
            <select aria-label="Môn học" value={course} disabled={coursesLoading || !courses.length} onChange={e => changeCourse(e.target.value)}
              className="w-full cursor-pointer appearance-none truncate bg-transparent pr-6 text-[15px] font-semibold text-slate-900 outline-none disabled:cursor-default">
              {!courses.length && <option value="">{coursesLoading ? "Đang tải…" : "Chưa có môn học"}</option>}
              {courses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code || c.id})</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-400" />
          </span>
        </label>
        <label className={filterBox}>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Loại tài liệu</span>
          <span className="relative block">
            <select aria-label="Loại tài liệu" value={docType} onChange={e => changeDocType(e.target.value)}
              className="w-full cursor-pointer appearance-none bg-transparent pr-6 text-[15px] font-semibold text-slate-900 outline-none">
              <option value="">Tất cả</option>
              {Object.entries(DOC_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-400" />
          </span>
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-slate-400">
          <Search size={20} className="shrink-0 text-slate-400" />
          <input aria-label="Tìm tài liệu" placeholder={courseCode ? `Tìm tài liệu, nội dung trong môn ${current?.name}…` : "Tìm tài liệu…"} value={query} disabled={!course}
            onChange={e => changeQuery(e.target.value)} className="w-full min-w-0 bg-transparent py-3.5 text-[15px] outline-none placeholder:text-slate-400" />
          {query && <button aria-label="Xóa tìm kiếm" onClick={() => changeQuery("")} className="rounded p-1 text-slate-400 hover:text-slate-900"><X size={18} /></button>}
        </div>
      </div>}

      <div>
        <section className="min-w-0" aria-label="Danh sách tài liệu">
          {!source && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{loading ? "Đang tải…" : error ? "" : <><span className="font-semibold text-slate-900">{total}</span> tài liệu{docType && ` · ${DOC_TYPE_LABEL[docType]}`}{query && ` · khớp “${query}”`}</>}</p>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Kiểu hiển thị">{([{ value: "grid", label: "Dạng lưới", icon: LayoutGrid }, { value: "list", label: "Dạng danh sách", icon: List }] as const).map(item => <button key={item.value} aria-label={item.label} title={item.label} aria-pressed={view === item.value} onClick={() => setView(item.value)} className={`rounded-lg p-2 transition ${view === item.value ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-700"}`}><item.icon size={18} /></button>)}</div>
          </div>}

          {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button onClick={refresh} className="mt-2 font-semibold underline">Thử lại</button></div>}
          {loading && <div role="status" className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><Loader2 size={28} className="animate-spin" />Đang tải tài liệu…</div>}
          {!loading && !error && !documents.length && <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center"><div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-slate-100 bg-slate-50 text-slate-400">{query ? <Search size={34} strokeWidth={1.4} /> : <BookOpen size={34} strokeWidth={1.4} />}</div><h3 className="text-lg font-semibold">{!courses.length ? "Thư viện đang chờ bạn khám phá" : query || docType ? "Không tìm thấy tài liệu phù hợp" : "Chưa có tài liệu trong môn học này"}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{!courses.length ? "Bạn chưa được cấp quyền đọc môn học. Hãy liên hệ giảng viên để được truy cập tài liệu học tập." : query || docType ? "Thử từ khóa hoặc loại tài liệu khác." : "Tài liệu sẽ xuất hiện tại đây sau khi được giảng viên phát hành và cấp quyền đọc."}</p>{query || docType ? <button onClick={() => { setDocType(""); changeQuery(""); }} className={`${button} mt-5`}>Xóa bộ lọc</button> : <Link href="/" className={`${button} mt-5`}><Sparkles size={16} />Khám phá Chat AI<ArrowUpRight size={15} /></Link>}</div>}

          {/* Danh sách thẻ */}
          {!loading && !error && documents.length > 0 && !source && <div className={`grid gap-4 ${view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : ""}`}>
            {documents.map(d => <article key={d.version_id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md">
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{courseCode} · {typeLabel(d)}</p>
                  <Link href={askHref(d)} title="Hỏi AI về tài liệu này" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"><Sparkles size={12} />Hỏi AI</Link>
                </div>
                <button type="button" onClick={() => open(d)} className="mt-2 text-left">
                  <h3 className="line-clamp-2 break-words text-[16px] font-semibold leading-6 group-hover:underline">{d.title}</h3>
                </button>
                {d.snippet && <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-slate-500">…{d.snippet}…</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><Layers size={13} />{d.page_count || 0} trang</span>
                  <span className="inline-flex items-center gap-1.5"><FileText size={13} />{(d.file_type || "pdf").toUpperCase()}</span>
                  <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} />{fmtDate(d.published_at)}</span>
                </div>
              </div>
              <button type="button" onClick={() => open(d)}
                className="flex items-center justify-center gap-2 bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
                <BookOpen size={15} />Xem tài liệu<ChevronRight size={15} />
              </button>
            </article>)}
          </div>}

          {/* Trang chi tiết tài liệu */}
          {source && selectedDocument && <section id="library-detail" className="min-w-0 scroll-mt-4 space-y-3" aria-label="Chi tiết tài liệu">
            {/* Một thanh gọn: quay lại + tên + thông tin 1 dòng + nút — nhường chỗ cho khung đọc */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <button type="button" onClick={() => setSource(null)} aria-label="Quay lại danh sách" title="Quay lại danh sách"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"><ArrowLeft size={18} /></button>
              <div className="relative min-w-0 flex-1" ref={pickerRef}>
                {/* Bấm tên / mũi tên → chọn tài liệu khác ngay khi đang đọc (danh sách trang hiện tại, đã lọc quyền ở server) */}
                <button type="button" onClick={() => { setPickerOpen(v => !v); setPickerQuery(""); }} aria-haspopup="listbox" aria-expanded={pickerOpen}
                  className="flex max-w-full items-center gap-1.5 rounded-md text-left hover:text-slate-600" title="Chọn tài liệu khác">
                  <h2 className="truncate text-[15px] font-semibold leading-tight">{selectedDocument.title}</h2>
                  <ChevronDown size={16} className={`shrink-0 text-slate-500 transition ${pickerOpen ? "rotate-180" : ""}`} />
                </button>
                {pickerOpen && <div className="absolute left-0 top-full z-30 mt-2 w-[min(440px,85vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox" aria-label="Chọn tài liệu">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3">
                    <Search size={15} className="shrink-0 text-slate-400" />
                    <input autoFocus value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} placeholder="Lọc tài liệu…" aria-label="Lọc tài liệu"
                      onKeyDown={e => { if (e.key === "Escape") setPickerOpen(false); }}
                      className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" />
                  </div>
                  <ul className="max-h-80 overflow-y-auto p-1.5">
                    {pickerDocs.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Không có tài liệu khớp.</li>}
                    {pickerDocs.map(d => {
                      const active = d.version_id === selectedDocument.version_id;
                      return <li key={d.version_id}>
                        <button type="button" role="option" aria-selected={active} onClick={() => { open(d); setPickerOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"}`}>
                          <FileText size={15} className="shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate">{d.title}</span>
                          <span className="shrink-0 text-xs text-slate-400">{d.page_count || 0} tr</span>
                          {active && <Check size={15} className="shrink-0 text-slate-700" />}
                        </button>
                      </li>;
                    })}
                  </ul>
                  {total > documents.length && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">Đang hiện {documents.length}/{total} tài liệu của trang danh sách hiện tại.</p>}
                </div>}
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {current?.name} · {typeLabel(selectedDocument)} · Phiên bản {selectedDocument.version_label} · {selectedDocument.page_count || 0} trang · {(selectedDocument.file_type || "pdf").toUpperCase()} · {fmtDate(selectedDocument.published_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedDocument.can_download && <button type="button" disabled={downloading} onClick={() => void download(selectedDocument)} className={`${button} !px-3 !py-2`} title="Tải về"><Download size={15} /><span className="hidden sm:inline">{downloading ? "Đang tải…" : "Tải về"}</span></button>}
                <Link href={askHref(selectedDocument)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"><Sparkles size={15} />Hỏi AI</Link>
              </div>
            </div>
            <ScrollDocumentReader key={source.versionId} source={source} />
          </section>}

          {!loading && !error && total > 0 && !source && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><p>Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} trong {total} tài liệu</p><nav aria-label="Phân trang" className="flex items-center gap-3"><button aria-label="Trang trước" className={`${button} !p-2`} disabled={page <= 1} onClick={() => { setPage(p => p - 1); setSource(null); }}><ChevronLeft size={16} /></button><span>Trang {page} / {Math.ceil(total / PAGE_SIZE)}</span><button aria-label="Trang sau" className={`${button} !p-2`} disabled={page * PAGE_SIZE >= total} onClick={() => { setPage(p => p + 1); setSource(null); }}><ChevronRight size={16} /></button></nav></div>}
        </section>
      </div>
      <p className="flex items-start justify-center gap-2 text-center text-xs leading-5 text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0" />{current ? `Bạn đang xem học liệu của môn ${current.name}.` : "Quyền truy cập tài liệu được quản lý theo từng môn học."}</p>
    </div>
  </div>;
}
