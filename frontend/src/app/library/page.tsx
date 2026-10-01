"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, FileText, GraduationCap, Home, LayoutGrid, LibraryBig, List, Loader2, MessageSquare, Moon, RefreshCw, Search, ShieldCheck, Sparkles, Sun, UserRound, X } from "lucide-react";
import type { SourceReference } from "../../components/source-reader";
import ScrollDocumentReader from "../../components/scroll-document-reader";
import { API, authHeaders, responseError } from "../../lib/api-errors";
import "./library.css";

// /me/courses already returns only courses readable by the current user.
type Course = { id: string; name: string };
type Document = { document_id: string; version_id: string; title: string; version_label: string; page_count: number };
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

export default function Library() {
  const { resolvedTheme, setTheme } = useTheme();
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState("");
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
  const loading = coursesLoading || documentsLoading;
  const courseName = courses.find(c => c.id === course)?.name;
  const selectedDocument = documents.find(d => d.version_id === source?.versionId);

  useEffect(() => {
    if (source) document.getElementById("library-reader")?.scrollIntoView({ block: "start" });
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
    const params = new URLSearchParams({ course_id: course, q: query, page: String(page), page_size: "20" });
    const timer = setTimeout(() => {
      fetch(`${API}/documents?${params}`, { headers: authHeaders(), signal: controller.signal, cache: "no-store" })
        .then(async r => { if (!r.ok) throw await responseError(r); return r.json(); })
        .then(d => { if (!controller.signal.aborted) { setDocuments(d.items); setTotal(d.total); } })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setDocumentsLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [course, query, page, coursesLoading]);

  function changeCourse(value: string) { setCourse(value); setPage(1); setError(""); setSource(null); setDocuments([]); setTotal(0); }
  function changeQuery(value: string) { setQuery(value); setPage(1); setError(""); setSource(null); setDocuments([]); setTotal(0); }
  function refresh() { setSource(null); setDocuments([]); setTotal(0); setDocumentsLoading(false); setAttempt(n => n + 1); }

  return <main className="library-page min-h-screen bg-[#f8f9fa] text-slate-900">
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link href="/" className="flex h-20 items-center gap-3 border-b border-slate-100 px-7 text-2xl font-extrabold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white"><BookOpen size={21} /></span>Vedu</Link>
        <nav aria-label="Điều hướng chính" className="space-y-2 p-4 text-sm font-medium">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><MessageSquare size={19} />Chat AI</Link>
          <Link href="/profile" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><UserRound size={19} />Hồ sơ</Link>
          <div className="my-4 border-t border-slate-100" />
          <p className="px-4 pb-2 text-[11px] font-semibold tracking-widest text-slate-400">KHÔNG GIAN HỌC TẬP</p>
          <Link href="/library" aria-current="page" className="flex items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 font-semibold"><LibraryBig size={19} />Tài liệu học tập</Link>
          <Link href="/learning" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><GraduationCap size={20} />Lộ trình học tập</Link>
        </nav>
        <div className="mx-5 mb-6 mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <ShieldCheck size={22} className="mb-3 text-emerald-600" /><p className="text-sm font-semibold">Nguồn học liệu tin cậy</p><p className="mt-2 text-xs leading-5 text-slate-500">Chỉ hiển thị tài liệu đã phát hành và được cấp quyền truy cập.</p>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3 text-sm"><Link href="/" aria-label="Trang chủ" className="text-slate-500 hover:text-slate-900"><Home size={18} /></Link><ChevronRight size={15} className="text-slate-300" /><span className="font-semibold">Thư viện tài liệu</span></div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-black"><ArrowLeft size={16} /><span className="hidden sm:inline">Về Chat AI</span></Link>
            <button type="button" aria-label="Chuyển giao diện sáng/tối" title="Chuyển giao diện sáng/tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
              <Moon size={18} className="dark:hidden" aria-hidden="true" />
              <Sun size={18} className="hidden dark:block" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Thư viện của bạn</p><h1 className="text-3xl font-bold tracking-tight">Tài liệu học tập</h1><p className="mt-2 text-sm leading-6 text-slate-500">Khám phá học liệu, đọc tài liệu và tìm lời giải cùng trợ lý AI.</p></div>
            <button onClick={refresh} disabled={loading} className={button}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Tải lại</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-600"><BookOpen size={23} /></span><div><p className="text-2xl font-bold tabular-nums">{coursesLoading ? "—" : courses.length}</p><p className="mt-1 text-xs text-slate-500">Môn học được truy cập</p></div></div>
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span className="grid h-12 w-12 place-items-center rounded-xl bg-violet-50 text-violet-600"><FileText size={23} /></span><div><p className="text-2xl font-bold tabular-nums">{loading || error ? "—" : total}</p><p className="mt-1 text-xs text-slate-500">Tài liệu theo bộ lọc</p></div></div>
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-emerald-600"><ShieldCheck size={23} /></span><div><p className="text-sm font-semibold text-emerald-800">Đã được phát hành</p><p className="mt-1 text-xs leading-5 text-emerald-700">Học liệu trong phạm vi quyền đọc của bạn</p></div></div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Danh sách tài liệu">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><LibraryBig size={19} />Danh sách tài liệu</h2><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} />Đã phát hành</span></div>
            <div className="flex flex-wrap gap-3 p-5">
              <select aria-label="Môn học" value={course} disabled={coursesLoading || !courses.length} onChange={e => changeCourse(e.target.value)} className="min-w-0 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm disabled:text-slate-400 sm:w-64">{!courses.length && <option value="">{coursesLoading ? "Đang tải môn học…" : "Chưa có môn học"}</option>}{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-slate-400"><Search size={18} className="shrink-0 text-slate-400" /><input aria-label="Tìm tài liệu" placeholder="Tìm theo tên tài liệu…" value={query} disabled={!course} onChange={e => changeQuery(e.target.value)} className="w-full min-w-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" />{query && <button aria-label="Xóa tìm kiếm" onClick={() => changeQuery("")} className="rounded p-1 text-slate-400 hover:text-slate-900"><X size={16} /></button>}</div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Kiểu hiển thị">{([{ value: "grid", label: "Dạng lưới", icon: LayoutGrid }, { value: "list", label: "Dạng danh sách", icon: List }] as const).map(item => <button key={item.value} aria-label={item.label} title={item.label} aria-pressed={view === item.value} onClick={() => setView(item.value)} className={`rounded-lg p-2 transition ${view === item.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}><item.icon size={18} /></button>)}</div>
            </div>

            {error && <div role="alert" className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button onClick={refresh} className="mt-2 font-semibold underline">Thử lại</button></div>}
            {loading && <div role="status" className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-slate-500"><Loader2 size={28} className="animate-spin" />Đang tải tài liệu…</div>}
            {!loading && !error && !documents.length && <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center"><div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-slate-100 bg-slate-50 text-slate-400">{query ? <Search size={34} strokeWidth={1.4} /> : <BookOpen size={34} strokeWidth={1.4} />}</div><h3 className="text-lg font-semibold">{!courses.length ? "Thư viện đang chờ bạn khám phá" : query ? "Không tìm thấy tài liệu phù hợp" : "Chưa có tài liệu trong môn học này"}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{!courses.length ? "Bạn chưa được cấp quyền đọc môn học. Hãy liên hệ giảng viên để được truy cập tài liệu học tập." : query ? "Thử từ khóa khác hoặc xóa tìm kiếm để xem các tài liệu đã phát hành." : "Tài liệu sẽ xuất hiện tại đây sau khi được giảng viên phát hành và cấp quyền đọc."}</p>{query ? <button onClick={() => changeQuery("")} className={`${button} mt-5`}>Xóa tìm kiếm</button> : <Link href="/" className={`${button} mt-5`}><Sparkles size={16} />Khám phá Chat AI<ArrowUpRight size={15} /></Link>}</div>}

            {!loading && !error && documents.length > 0 && <div className="space-y-4 px-3 pb-5 sm:px-5">
              {!source && <div className={`grid gap-4 ${view === "grid" ? "md:grid-cols-2 2xl:grid-cols-3" : ""}`}>
                {documents.map(d => <article key={d.version_id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-400">
                  <div className="mb-4 flex items-center justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600"><FileText size={22} /></span><span className="text-xs font-medium text-emerald-600">Đã phát hành</span></div>
                  <h3 className="break-words font-semibold leading-6">{d.title}</h3><p className="mt-2 text-xs text-slate-500">Phiên bản {d.version_label} <span className="px-1">·</span> {d.page_count || 0} trang</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-5"><button className={`${button} flex-1 whitespace-nowrap`} onClick={() => setSource({ documentId: d.document_id, versionId: d.version_id, page: 1 })}><BookOpen size={15} />Xem tài liệu</button><Link className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-700" href={`/?document=${encodeURIComponent(d.document_id)}&title=${encodeURIComponent(d.title)}`}><Sparkles size={15} />Hỏi AI</Link></div>
                </article>)}
              </div>}
              {source && selectedDocument && <section id="library-reader" className="min-w-0 scroll-mt-4 space-y-3" aria-label="Xem tài liệu">
                <header className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-600"><FileText size={20} /></span>
                  <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{selectedDocument.title}</h3><p className="mt-1 text-xs text-slate-500">Phiên bản {selectedDocument.version_label} · {selectedDocument.page_count || 0} trang <span className="ml-2 text-emerald-600">Đã phát hành</span></p></div>
                  <div className="flex items-center gap-2"><Link className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700" href={`/?document=${encodeURIComponent(selectedDocument.document_id)}&title=${encodeURIComponent(selectedDocument.title)}`}><Sparkles size={14} />Hỏi AI</Link><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setSource(null)}><List size={14} />Danh sách</button></div>
                </header>
                <ScrollDocumentReader key={source.versionId} source={source} />
              </section>}
            </div>}
            {!loading && !error && total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><p>Hiển thị {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} trong {total} tài liệu</p><nav aria-label="Phân trang" className="flex items-center gap-3"><button aria-label="Trang trước" className={`${button} !p-2`} disabled={page <= 1} onClick={() => { setPage(p => p - 1); setSource(null); }}><ChevronLeft size={16} /></button><span>Trang {page} / {Math.ceil(total / 20)}</span><button aria-label="Trang sau" className={`${button} !p-2`} disabled={page * 20 >= total} onClick={() => { setPage(p => p + 1); setSource(null); }}><ChevronRight size={16} /></button></nav></div>}
          </section>
          <p className="flex items-start justify-center gap-2 text-center text-xs leading-5 text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0" />{courseName ? `Bạn đang xem học liệu của môn ${courseName}.` : "Quyền truy cập tài liệu được quản lý theo từng môn học."}</p>
        </div>
      </section>
    </div>
  </main>;
}
