"use client";
/* eslint-disable @next/next/no-img-element -- Page images require authenticated blob URLs. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import type { SourceReference } from "./source-reader";
import { API, authHeaders, responseError } from "../lib/api-errors";

type PageData = { title: string; page_count: number; pages: { page: number; text: string }[] };
const unavailable = (status: number) => [401, 403, 404, 410].includes(status);

function ScrollPage({ base, page, root, onUnavailable }: {
  base: string;
  page: number;
  root: RefObject<HTMLDivElement | null>;
  onUnavailable: (message: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [image, setImage] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: root.current, rootMargin: "900px 0px",
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) return;
    const controller = new AbortController();
    let url = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImage(""); setText(null); setError("");
    const init = { headers: authHeaders(), signal: controller.signal, cache: "no-store" as const };
    async function load() {
      const response = await fetch(`${base}/pages/${page}/image?width=1400`, init);
      if (response.ok) {
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage(url);
        return;
      }
      if (unavailable(response.status)) {
        const failure = await responseError(response);
        if (!controller.signal.aborted) onUnavailable(failure.message);
        return;
      }
      // PPTX or pages that cannot be rendered still expose authorized extracted text.
      const fallback = await fetch(`${base}/pages?page_from=${page}&page_to=${page}`, init);
      if (!fallback.ok) {
        const failure = await responseError(fallback);
        if (unavailable(fallback.status) && !controller.signal.aborted) onUnavailable(failure.message);
        throw failure;
      }
      const data: PageData = await fallback.json();
      if (!controller.signal.aborted) setText(data.pages.map(p => p.text).join("\n\n") || "Trang này chưa có nội dung văn bản trích xuất.");
    }
    load().catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [base, page, near, attempt, onUnavailable]);

  return <section ref={ref} id={`reader-page-${page}`} data-page={page} aria-label={`Trang ${page}`} className="scroll-reader-page">
    <div className="scroll-reader-sheet">
      {!near ? <span className="text-sm text-slate-400">Trang {page}</span> : error ? <div role="alert" className="p-6 text-center text-sm text-red-700"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)} className="mt-3 inline-flex items-center gap-2 underline"><RefreshCw size={14} />Thử lại trang {page}</button></div> : image ? <img src={image} alt={`Nội dung trang ${page}`} className="h-full w-full object-contain" /> : text !== null ? <div className="h-full w-full overflow-auto p-6 sm:p-10"><p className="mb-4 text-xs text-amber-700">Bản văn bản · Không có ảnh xem trước</p><p className="whitespace-pre-wrap text-sm leading-7">{text}</p></div> : <div role="status" className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" />Đang tải trang {page}…</div>}
    </div>
    <p className="py-3 text-center text-xs text-slate-500">Trang {page}</p>
  </section>;
}

export default function ScrollDocumentReader({ source }: { source: SourceReference }) {
  const root = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [target, setTarget] = useState(String(source.page));
  const base = `${API}/documents/${encodeURIComponent(source.documentId)}/versions/${encodeURIComponent(source.versionId)}`;
  const onUnavailable = useCallback((message: string) => { setError(message); setData(null); }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null); setError("");
    fetch(`${base}/pages?page_from=1&page_to=1`, { headers: authHeaders(), signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw await responseError(response); return response.json(); })
      .then((result: PageData) => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [base, attempt]);

  function jumpToPage() {
    if (!data || !root.current) return;
    const page = Math.max(1, Math.min(data.page_count, Number(target) || 1));
    setTarget(String(page));
    const element = root.current.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (element) root.current.scrollTo({ top: root.current.scrollTop + element.getBoundingClientRect().top - root.current.getBoundingClientRect().top - 16, behavior: "instant" });
  }

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 text-xs">
      <form onSubmit={e => { e.preventDefault(); jumpToPage(); }} className="flex items-center gap-2"><label htmlFor="reader-target-page" className="text-slate-500">Đi tới trang</label><input id="reader-target-page" type="number" min={1} max={data?.page_count || 1} value={target} disabled={!data} onChange={e => setTarget(e.target.value)} className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center" /><span className="text-slate-500">/ {data?.page_count || "—"}</span><button disabled={!data} className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40">Đi</button></form>
      <span className="hidden text-slate-400 sm:inline">Cuộn để đọc liên tục</span>
      <div className="flex items-center gap-2"><button aria-label="Thu nhỏ" disabled={zoom <= 60} onClick={() => setZoom(z => z - 20)} className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-30"><Minus size={16} /></button><button title="Đặt lại kích thước" onClick={() => setZoom(100)} className="min-w-12 rounded-lg py-1.5 text-center tabular-nums hover:bg-slate-100">{zoom}%</button><button aria-label="Phóng to" disabled={zoom >= 160} onClick={() => setZoom(z => z + 20)} className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-30"><Plus size={16} /></button></div>
    </div>
    <div ref={root} tabIndex={0} aria-label="Nội dung tài liệu cuộn liên tục" className="scroll-reader-viewport">
      {error ? <div role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{error}</p><button className="mt-3 font-semibold underline" onClick={() => setAttempt(n => n + 1)}>Tải lại tài liệu</button></div> : !data ? <div role="status" className="flex justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Đang kiểm tra quyền và tải tài liệu…</div> : data.page_count > 0 ? <div className="scroll-reader-pages" style={{ width: `${zoom}%`, maxWidth: `${9 * zoom}px` }}>{Array.from({ length: data.page_count }, (_, i) => <ScrollPage key={`${base}-${attempt}-${i}`} base={base} page={i + 1} root={root} onUnavailable={onUnavailable} />)}</div> : <p className="p-8 text-center text-sm text-slate-500">Tài liệu chưa có trang để hiển thị.</p>}
    </div>
  </div>;
}
