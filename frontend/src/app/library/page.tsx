"use client";

import { useEffect, useState } from "react";
import SourceReader, { SourceReference } from "../../components/source-reader";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { API, authHeaders, responseError } from "../../lib/api-errors";
import { Search, X, BookOpen, FileText, Sparkles, Layers, ArrowLeft, ArrowRight, BookMarked } from "lucide-react";
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
      .then(d => { 
        const rows = (d.items as Course[]).filter(c => c.can_read); 
        setCourses(rows); 
        setCourse(rows[0]?.id || ""); 
      })
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
        { opacity: 0, y: 15, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.05, ease: "power2.out" }
      );
    }
  }, [loading, documents]);

  const selectedCourseName = courses.find(c => c.id === course)?.name;

  return (
    <AppShell
      rightPanel={
        source ? (
          <div className="w-full flex flex-col h-full bg-card">
            <header className="h-[56px] shrink-0 border-b border-border/80 flex items-center justify-between px-4 bg-secondary/30 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-primary" />
                <span className="font-semibold text-[13.5px] text-foreground">Xem trực tiếp tài liệu</span>
              </div>
              <button 
                onClick={() => setSource(null)} 
                aria-label="Đóng bảng xem trước"
                className="p-1.5 text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer rounded-lg hover:bg-secondary transition-colors"
              >
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
      <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
        {/* TOP SEGMENTED NAV */}
        <header className="h-[54px] shrink-0 flex items-center px-4 w-full relative z-10 border-b border-border/40">
          <div className="flex-1 flex justify-center w-full">
            <nav className="flex items-center bg-secondary/50 p-1 rounded-xl border border-border/60 shadow-xs" aria-label="Chuyển chế độ">
              <Link 
                href="/" 
                className="px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors no-underline"
              >
                Hội thoại AI
              </Link>
              <button 
                type="button"
                className="px-3.5 py-1.5 text-[13px] font-semibold bg-background text-foreground shadow-xs rounded-lg cursor-default border-0"
              >
                Thư viện tài liệu
              </button>
            </nav>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] p-6 lg:p-10 space-y-8">
            
            {/* HERO HEADER */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                  <BookMarked size={13} />
                  <span>Kho tri thức học tập</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">Thư viện tài liệu</h1>
                <p className="text-muted-foreground text-sm max-w-xl">
                  Truy cập giáo trình, slide bài giảng và tài liệu học tập chính thống. Nhấp để đọc trực tiếp hoặc đặt câu hỏi cùng AI.
                </p>
              </div>

              {total > 0 && !loading && (
                <div className="text-xs font-medium text-muted-foreground bg-secondary/60 px-3.5 py-1.5 rounded-full border border-border/60 self-start md:self-auto">
                  Tổng cộng: <strong className="text-foreground">{total}</strong> tài liệu
                </div>
              )}
            </div>

            {/* SEARCH & FILTER CONTROLS */}
            <div className="glass-card p-2 rounded-2xl flex flex-col sm:flex-row gap-2.5 transition-all focus-within:ring-2 focus-within:ring-primary/20">
              <div className="relative flex-1 flex items-center">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search size={18} className="text-muted-foreground" />
                </div>
                <input 
                  aria-label="Tìm kiếm tài liệu" 
                  placeholder="Nhập tên giáo trình, tài liệu, chủ đề…" 
                  value={query} 
                  onChange={e => { setQuery(e.target.value); setPage(1); }} 
                  className="w-full bg-transparent border-0 outline-none text-foreground py-2.5 pl-10 pr-9 text-sm focus:ring-0 placeholder:text-muted-foreground" 
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setPage(1); }}
                    aria-label="Xoá tìm kiếm"
                    className="absolute right-3 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="h-px sm:h-auto sm:w-px bg-border/60 my-1 sm:my-0" />

              <div className="relative min-w-[220px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Layers size={16} />
                </div>
                <select 
                  aria-label="Lọc theo môn học" 
                  value={course} 
                  onChange={e => { setCourse(e.target.value); setPage(1); }} 
                  className="w-full bg-secondary/50 text-foreground py-2.5 pl-9 pr-8 rounded-xl border border-border/60 outline-none hover:bg-secondary cursor-pointer text-sm font-medium transition-colors"
                >
                  {!courses.length && <option value="">Đang tải môn học...</option>}
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-xl text-sm border border-destructive/20 flex items-center gap-2">
                <span>{error}</span>
              </div>
            )}

            {/* DOCUMENT GRID */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="animate-pulse glass-card rounded-2xl p-5 border border-border/60 flex flex-col justify-between h-[210px]">
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary/80" />
                      <div className="h-4 bg-secondary/80 rounded-md w-3/4" />
                      <div className="h-3 bg-secondary/60 rounded-md w-1/2" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border/40">
                      <div className="h-9 bg-secondary/80 rounded-xl" />
                      <div className="h-9 bg-secondary/80 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !documents.length && !error ? (
              <div className="text-center py-16 px-4 glass-card rounded-3xl border border-border/60 border-dashed max-w-lg mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                  <BookOpen size={28} className="opacity-60" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Không tìm thấy tài liệu phù hợp</h3>
                <p className="text-muted-foreground text-sm mb-5">
                  {query 
                    ? `Không có kết quả nào cho "${query}" trong môn ${selectedCourseName ?? ""}.` 
                    : "Môn học này hiện chưa có tài liệu công khai hoặc bạn chưa được cấp quyền đọc."}
                </p>
                {query && (
                  <button
                    onClick={() => { setQuery(""); setPage(1); }}
                    className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-xl border border-border transition-colors cursor-pointer"
                  >
                    Xoá từ khoá tìm kiếm
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {documents.map(d => (
                  <article 
                    key={d.version_id} 
                    className="doc-card group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card hover:bg-card/90 hover:border-primary/40 hover:shadow-md p-5 transition-all duration-200"
                  >
                    <div className="space-y-3 mb-5">
                      <div className="flex items-center justify-between">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                          <FileText size={18} />
                        </div>
                        <span className="text-[11px] font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md border border-border/60">
                          v{d.version_label}
                        </span>
                      </div>

                      <div>
                        <h2 className="font-semibold text-[15px] leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors" title={d.title}>
                          {d.title}
                        </h2>
                        <span className="text-xs text-muted-foreground mt-1 inline-block">
                          {d.page_count ? `${d.page_count} trang` : "Chưa rõ số trang"}
                        </span>
                      </div>
                    </div>
                    
                    {/* ACCESSIBLE DUAL ACTIONS: Clearly visible and friendly on both touch and desktop */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/50">
                      <button 
                        type="button"
                        className="w-full bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium py-2 px-3 rounded-xl border border-border/70 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer" 
                        onClick={() => setSource({ documentId: d.document_id, versionId: d.version_id, page: 1 })}
                        aria-label={`Đọc tài liệu ${d.title}`}
                      >
                        <BookOpen size={14} className="text-muted-foreground" />
                        <span>Đọc sách</span>
                      </button>

                      <Link 
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold py-2 px-3 rounded-xl text-center flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] no-underline" 
                        href={`/?document=${encodeURIComponent(d.document_id)}&title=${encodeURIComponent(d.title)}`}
                        aria-label={`Hỏi AI về tài liệu ${d.title}`}
                      >
                        <Sparkles size={14} />
                        <span>Hỏi AI</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* PAGINATION */}
            {!!total && !loading && Math.ceil(total / 20) > 1 && (
              <div className="flex items-center justify-center gap-3 pt-6 border-t border-border/40">
                <button 
                  disabled={page <= 1} 
                  onClick={() => setPage(p => p - 1)}
                  className="px-3.5 py-2 glass-panel rounded-xl disabled:opacity-40 text-xs font-medium hover:bg-secondary cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Trang trước</span>
                </button>
                <span className="text-xs font-semibold text-muted-foreground px-2">
                  Trang {page} / {Math.ceil(total / 20)}
                </span>
                <button 
                  disabled={page * 20 >= total} 
                  onClick={() => setPage(p => p + 1)}
                  className="px-3.5 py-2 glass-panel rounded-xl disabled:opacity-40 text-xs font-medium hover:bg-secondary cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <span>Trang sau</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
