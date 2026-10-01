"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated blob URLs are local, not optimizer-accessible images. */

import { useEffect, useState } from "react";
import { API, authHeaders, responseError } from "../lib/api-errors";

export type SourceReference = { citationId?: string; documentId: string; versionId: string; page: number };
type PageData = { title: string; page_count: number; pages: { page: number; text: string }[] };

export default function SourceReader({ source }: { source: SourceReference }) {
  const [page, setPage] = useState(source.page);
  const [data, setData] = useState<PageData | null>(null);
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    // Clear the previous protected page before starting a new authenticated request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null); setImage(""); setError(""); setImageError(""); setLoading(true);
    const init = { headers: authHeaders(), signal: controller.signal, cache: "no-store" as const };
    const base = `${API}/documents/${encodeURIComponent(source.documentId)}/versions/${encodeURIComponent(source.versionId)}`;
    async function load() {
      // Re-authorize the citation too, rather than trusting the old quote held by the browser.
      if (source.citationId) {
        const check = await fetch(`${API}/citations/${encodeURIComponent(source.citationId)}/source`, init);
        if (!check.ok) throw await responseError(check);
      }
      const response = await fetch(`${base}/pages?page_from=${page}&page_to=${page}`, init);
      if (!response.ok) throw await responseError(response);
      const pages: PageData = await response.json();
      const picture = await fetch(`${base}/pages/${page}/image`, init);
      if (picture.ok) {
        const blob = await picture.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage(url);
      } else {
        const failure = await responseError(picture);
        if ([401, 403, 404, 410].includes(picture.status)) throw failure;
        if (!controller.signal.aborted) setImageError(failure.message);
      }
      if (!controller.signal.aborted) setData(pages);
    }
    load().catch(e => { if (!controller.signal.aborted) { setData(null); setImage(""); setError(e.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [source.documentId, source.versionId, source.citationId, page, attempt]);

  return <section className="space-y-4" aria-label="Trang tài liệu trích dẫn">
    <div className="flex items-center justify-between gap-2 text-sm">
      <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button>
      <span>Trang {page}{data ? ` / ${data.page_count}` : ""}</span>
      <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={loading || !data || page >= data.page_count} onClick={() => setPage(p => p + 1)}>Sau</button>
    </div>
    {loading && <p role="status">Đang tải và kiểm tra quyền xem nguồn…</p>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700"><p>{error}</p><button className="mt-2 underline" onClick={() => setAttempt(n => n + 1)}>Tải lại</button></div>}
    {data && <>
      <h3 className="font-semibold">{data.title}</h3>
      {imageError && <p role="status" className="text-sm text-amber-700">{imageError}</p>}
      {image && <a href={image} target="_blank" rel="noopener noreferrer" title="Phóng to trang"><img src={image} alt={`${data.title} — trang ${page}`} className="w-full rounded-lg border bg-white" /></a>}
      <details open={!image}><summary className="cursor-pointer text-sm">Nội dung trích xuất của trang</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{data.pages.map(p => p.text).join("\n\n") || "Trang này chưa có nội dung văn bản trích xuất."}</p></details>
      <a className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-sm text-white" href={`/chat?document=${encodeURIComponent(source.documentId)}&title=${encodeURIComponent(data.title)}`}>Hỏi AI về tài liệu này</a>
    </>}
  </section>;
}
