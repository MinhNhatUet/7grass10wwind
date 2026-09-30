"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SourceReader, { type SourceReference } from "../../components/source-reader";
import { AppShell } from "@/components/layout/AppShell";
import { API, authHeaders, responseError } from "../../lib/api-errors";
import { Search, X, BookOpen, FileText } from "lucide-react";
import gsap from "gsap";

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

  useEffect(() => {
    if (!loading && documents.length > 0) {
      gsap.fromTo(
        ".doc-card",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" }
      );
    }
  }, [loading, documents]);

  return (
    <AppShell
      rightPanel={
        source ? (
          <div className="w-full flex flex-col h-full bg-card">
            <header className="h-[60px] shrink-0 border-b border-border flex items-center justify-between px-4">
              <span className="font-semibold text-[14px] text-foreground">Xem trước tài liệu</span>
              <button onClick={() => setSource(null)} className="p-1 text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer rounded-lg hover:bg-secondary">
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 p-4 overflow-y-auto">
              <SourceReader key={`${source.versionId}-${source.page}`} source={source} />
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="mx-auto max-w-[1000px] p-6 lg:p-10 space-y-8">
          
          <header className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Thư viện tài liệu</h1>
            <p className="text-muted-foreground">Khám phá nguồn học liệu, tài liệu tham khảo theo môn học.</p>
          </header>

          <div className="flex flex-col sm:flex-row gap-4 bg-card p-2 rounded-2xl border border-border shadow-sm">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search size={18} className="text-muted-foreground" />
              </div>
              <input 
                aria-label="Tìm tài liệu" 
                placeholder="Tìm theo tên tài liệu…" 
                value={query} 
                onChange={e => { setQuery(e.target.value); setPage(1); }} 
                className="w-full bg-transparent border-0 outline-none text-foreground py-3 pl-11 pr-4 focus:ring-0 placeholder:text-muted-foreground" 
              />
            </div>
            <div className="h-px sm:h-auto sm:w-px bg-border my-2 sm:my-0 mx-2" />
            <select 
              aria-label="Môn học" 
              value={course} 
              onChange={e => { setCourse(e.target.value); setPage(1); }} 
              className="bg-secondary/50 text-foreground py-3 px-4 rounded-xl border-0 outline-none hover:bg-secondary cursor-pointer min-w-[200px]"
            >
              {!courses.length && <option value="">Đang tải...</option>}
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm border border-destructive/20">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="animate-pulse bg-secondary/50 rounded-2xl h-[160px] border border-border/50" />
              ))}
            </div>
          ) : !documents.length && !error ? (
            <div className="text-center py-20 bg-secondary/20 rounded-3xl border border-border/50 border-dashed">
              <BookOpen size={48} className="mx-auto text-muted-foreground mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-foreground mb-1">Không tìm thấy tài liệu</h3>
              <p className="text-muted-foreground">Chưa có tài liệu phù hợp hoặc bạn chưa được cấp quyền đọc.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map(d => (
                <article key={d.version_id} className="doc-card group relative flex flex-col justify-between rounded-2xl border border-border bg-card hover:bg-secondary/30 p-5 transition-all hover:shadow-md hover:border-primary/30">
                  <div className="space-y-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2 group-hover:scale-105 transition-transform">
                      <FileText size={20} />
                    </div>
                    <h2 className="font-semibold text-[16px] leading-snug line-clamp-2">{d.title}</h2>
                    <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
                      <span className="bg-secondary px-2 py-0.5 rounded-full border border-border">v{d.version_label}</span>
                      <span>{d.page_count || 0} trang</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 mt-auto">
                    <button 
                      className="w-full bg-secondary hover:bg-secondary/80 text-foreground text-[14px] font-medium py-2 px-4 rounded-xl border border-border transition-colors cursor-pointer" 
                      onClick={() => setSource({ documentId: d.document_id, versionId: d.version_id, page: 1 })}
                    >
                      Đọc tài liệu
                    </button>
                    <Link 
                      className="w-full bg-primary hover:opacity-90 text-primary-foreground text-[14px] font-medium py-2 px-4 rounded-xl text-center transition-colors no-underline" 
                      href={`/?document=${encodeURIComponent(d.document_id)}&title=${encodeURIComponent(d.title)}`}
                    >
                      Hỏi AI
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!!total && !loading && (
            <div className="flex items-center justify-center gap-4 pt-8">
              <button 
                disabled={page <= 1} 
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 bg-card border border-border rounded-lg disabled:opacity-50 text-sm font-medium hover:bg-secondary cursor-pointer"
              >
                Trang trước
              </button>
              <span className="text-sm font-medium text-muted-foreground">
                Trang {page} / {Math.ceil(total / 20) || 1}
              </span>
              <button 
                disabled={page * 20 >= total} 
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 bg-card border border-border rounded-lg disabled:opacity-50 text-sm font-medium hover:bg-secondary cursor-pointer"
              >
                Trang sau
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
