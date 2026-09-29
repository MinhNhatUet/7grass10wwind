"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SourceReader, { SourceReference } from "../../components/source-reader";
import { API, authHeaders, responseError } from "../../lib/api-errors";

type Course = { id: string; name: string; can_read: boolean };
type Document = { document_id: string; version_id: string; title: string; version_label: string; page_count: number };

export default function Library() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceReference | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/me/courses`, { headers: authHeaders(), signal: controller.signal })
      .then(async r => { if (!r.ok) throw await responseError(r); return r.json(); })
      .then(d => { const rows = (d.items as Course[]).filter(c => c.can_read); setCourses(rows); setCourse(rows[0]?.id || ""); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!course) return;
    const controller = new AbortController();
    // Reset results while fetching a different authorized course/filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(""); setDocuments([]); setSource(null);
    const params = new URLSearchParams({ course_id: course, q: query, page: String(page), page_size: "20" });
    fetch(`${API}/documents?${params}`, { headers: authHeaders(), signal: controller.signal })
      .then(async r => { if (!r.ok) throw await responseError(r); return r.json(); })
      .then(d => { setDocuments(d.items); setTotal(d.total); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [course, query, page]);

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/" className="text-blue-600">← Về Chat AI</Link>
      <h1 className="text-2xl font-bold">Tài liệu học tập</h1>
      <p className="text-sm text-slate-600">Chỉ hiển thị tài liệu đã phát hành mà bạn được phép đọc.</p>
      <div className="flex flex-wrap gap-3">
        <select aria-label="Môn học" value={course} onChange={e => { setCourse(e.target.value); setPage(1); }} className="rounded-xl border bg-white p-3">{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input aria-label="Tìm tài liệu" placeholder="Tìm theo tên tài liệu…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className="min-w-64 rounded-xl border bg-white p-3" />
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading && <p role="status">Đang tải tài liệu…</p>}
      {!loading && !error && !documents.length && <p>Chưa có tài liệu phù hợp hoặc bạn chưa được cấp quyền đọc môn học.</p>}
      <div className={`grid gap-6 ${source ? "lg:grid-cols-2" : ""}`}>
        <div className="space-y-3">{documents.map(d => <article key={d.version_id} className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">{d.title}</h2>
          <p className="my-2 text-sm text-slate-500">Phiên bản {d.version_label} · {d.page_count || 0} trang</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button className="rounded-lg border px-3 py-2" onClick={() => setSource({ documentId: d.document_id, versionId: d.version_id, page: 1 })}>Xem tài liệu</button>
            <Link className="rounded-lg bg-blue-600 px-3 py-2 text-white" href={`/?document=${encodeURIComponent(d.document_id)}&title=${encodeURIComponent(d.title)}`}>Hỏi AI về tài liệu này</Link>
          </div>
        </article>)}
        {!!total && <div className="flex items-center gap-4"><button disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Trang trước</button><span>{page} / {Math.ceil(total / 20)}</span><button disabled={loading || page * 20 >= total} onClick={() => setPage(p => p + 1)}>Trang sau</button></div>}
        </div>
        {source && <aside className="rounded-xl border bg-white p-4"><button className="mb-3 text-sm text-blue-600" onClick={() => setSource(null)}>Đóng phần xem</button><SourceReader key={`${source.versionId}-${source.page}`} source={source} /></aside>}
      </div>
    </div>
  </main>;
}
