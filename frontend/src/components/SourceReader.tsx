"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, fetchObjectUrl, openFile } from "@/lib/api";
import { MSG, errorMessage } from "@/lib/messages";

// UI-06 kiểu NotebookLM: mở toàn văn nguồn quanh vị trí trích dẫn, tự cuộn tới đoạn được tô sáng,
// đọc tiếp trang trước/sau. Mỗi lần tải trang backend kiểm tra lại quyền và trạng thái nguồn (BR-03).

export interface ReaderTarget {
  documentId: string;
  versionId: string;
  title: string;
  versionLabel: string;
  page: number;
  locatorType: "page" | "slide";
  highlight: string | null; // đoạn hỗ trợ ý (citation) hoặc đoạn khớp (Hub)
  canDownload: boolean;
}

interface PagesResponse {
  page_count: number | null;
  pages: { page: number; text: string }[];
}

const WINDOW = 1; // số trang trước/sau tải kèm lần đầu
const STEP = 2;

export type ReaderView = "page" | "text";

export function SourceReader({
  target,
  onClose,
  defaultView = "text",
}: {
  target: ReaderTarget;
  onClose: () => void;
  defaultView?: ReaderView;
}) {
  // Xem dạng trang gốc chỉ có với PDF (ảnh render phía server, D-31); slide PPTX luôn ở dạng văn bản
  const canPage = target.locatorType === "page";
  const [view, setView] = useState<ReaderView>(canPage ? defaultView : "text");
  const [pages, setPages] = useState<Map<number, string>>(new Map());
  const [range, setRange] = useState<[number, number] | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [current, setCurrent] = useState(target.page);
  const [pageInput, setPageInput] = useState(String(target.page));
  const [zoom, setZoom] = useState(100); // % bề rộng khung; 100 = vừa chiều ngang (chỉ cuộn dọc)
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mark = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const scrolledTo = useRef<string | null>(null); // đã cuộn tới đoạn trích của target này chưa (chỉ một lần)
  const pendingScroll = useRef<number | null>(null); // trang cần cuộn tới sau khi tải xong

  const load = useCallback(
    async (from: number, to: number, reset = false) => {
      setLoading(true);
      setErr(null);
      try {
        const r = await api<PagesResponse>(
          `/documents/${target.documentId}/versions/${target.versionId}/pages?page_from=${from}&page_to=${to}`,
        );
        setPageCount(r.page_count);
        setPages((prev) => {
          const next = reset ? new Map<number, string>() : new Map(prev);
          r.pages.forEach((p) => next.set(p.page, p.text));
          return next;
        });
        setRange((prev) => {
          const lo = r.pages[0]?.page ?? from;
          const hi = r.pages.at(-1)?.page ?? to;
          return reset || !prev ? [lo, hi] : [Math.min(prev[0], lo), Math.max(prev[1], hi)];
        });
      } catch (e) {
        setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
      } finally {
        setLoading(false);
      }
    },
    [target.documentId, target.versionId],
  );

  useEffect(() => {
    setCurrent(target.page);
    setPageInput(String(target.page));
    void load(Math.max(1, target.page - WINDOW), target.page + WINDOW, true);
  }, [target, load]);

  // Cuộn tới đoạn trích MỘT lần khi trang đích vừa tải (tải thêm trang lúc cuộn không kéo người đọc về lại)
  const targetKey = `${target.versionId}:${target.page}:${target.highlight ?? ""}`;
  useEffect(() => {
    if (scrolledTo.current === targetKey || !pages.has(target.page)) return;
    scrolledTo.current = targetKey;
    requestAnimationFrame(() => mark.current?.scrollIntoView({ block: view === "page" ? "start" : "center" }));
  }, [pages, target.page, targetKey, view]);

  const scrollToPage = (n: number) =>
    requestAnimationFrame(() =>
      body.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: "start" }),
    );

  // Nhảy xa: cửa sổ trang được tải lại — cuộn tới trang đích khi nó đã có trong DOM
  useEffect(() => {
    const n = pendingScroll.current;
    if (n !== null && range && n >= range[0] && n <= range[1]) {
      pendingScroll.current = null;
      scrollToPage(n);
    }
  }, [range]);

  /** Cuộn liên tục: gần cuối thì tự tải thêm; số trang trên thanh công cụ theo trang đang ở đầu khung. */
  function onScroll() {
    const el = body.current;
    if (!el || !range) return;
    if (!loading && (pageCount === null || range[1] < pageCount) && el.scrollTop + el.clientHeight > el.scrollHeight - el.clientHeight) {
      void load(range[1] + 1, range[1] + STEP);
    }
    const top = el.getBoundingClientRect().top;
    const secs = el.querySelectorAll<HTMLElement>("[data-page]");
    for (const sec of secs) {
      if (sec.getBoundingClientRect().bottom > top + 40) {
        const n = Number(sec.dataset.page);
        if (n !== current) {
          setCurrent(n);
          if (document.activeElement?.classList.contains("page-input") !== true) setPageInput(String(n));
        }
        break;
      }
    }
  }

  /** Chuyển trang bằng thanh điều hướng cố định — không phải cuộn xuống cuối để tìm nút. */
  function goTo(n: number) {
    const last = pageCount ?? n;
    const page = Math.max(1, Math.min(n, last));
    setCurrent(page);
    setPageInput(String(page));
    if (!range || page < range[0] - 1 || page > range[1] + 1) {
      // nhảy xa: tải lại cửa sổ quanh trang mới (tránh dải trang rỗng ở giữa)
      pendingScroll.current = page;
      void load(Math.max(1, page - WINDOW), page + WINDOW, true);
    } else if (!pages.has(page)) {
      pendingScroll.current = page;
      void load(page, page + (page > range[1] ? STEP - 1 : 0));
    } else {
      scrollToPage(page);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goTo(current + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goTo(current - 1);
    }
  }

  const unit = target.locatorType === "page" ? "Trang" : "Slide";
  const ordered = range ? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i) : [];
  const atEnd = pageCount !== null && current >= pageCount;

  return (
    <div className="reader" tabIndex={-1} onKeyDown={onKey}>
      <div className="source-head">
        <div>
          <strong>{target.title}</strong>
          <div className="muted small">
            Phiên bản {target.versionLabel}
            {target.highlight ? ` · đoạn trích ở ${unit.toLowerCase()} ${target.page}` : ""}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng nguồn">
          ×
        </button>
      </div>

      <div className="reader-toolbar">
        <div className="page-nav">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => goTo(current - 1)}
            disabled={current <= 1}
            aria-label={`${unit} trước`}
          >
            ‹
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(pageInput);
              if (Number.isInteger(n) && n >= 1) goTo(n);
            }}
          >
            <input
              className="page-input"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageInput(String(current))}
              aria-label={`Số ${unit.toLowerCase()} (Enter để chuyển)`}
            />
          </form>
          <span className="muted small">/ {pageCount ?? "…"}</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => goTo(current + 1)}
            disabled={atEnd}
            aria-label={`${unit} sau`}
          >
            ›
          </button>
          {target.highlight && current !== target.page && (
            <button type="button" className="btn-link small" onClick={() => goTo(target.page)}>
              Về đoạn trích
            </button>
          )}
        </div>
        {view === "page" && (
          <div className="zoom" role="group" aria-label="Thu phóng">
            <button type="button" className="btn-secondary" onClick={() => setZoom((z) => Math.max(50, z - 25))}
              disabled={zoom === 50} aria-label="Thu nhỏ">
              −
            </button>
            <span className="small">{zoom === 100 ? "Vừa khung" : `${zoom}%`}</span>
            <button type="button" className="btn-secondary" onClick={() => setZoom((z) => Math.min(200, z + 25))}
              disabled={zoom === 200} aria-label="Phóng to">
              +
            </button>
          </div>
        )}
        {canPage && (
          <div className="view-toggle" role="group" aria-label="Kiểu hiển thị">
            <button type="button" className={view === "page" ? "active" : ""} onClick={() => setView("page")}>
              Trang gốc
            </button>
            <button
              type="button"
              className={view === "text" ? "active" : ""}
              onClick={() => {
                setView("text");
                scrollToPage(current);
              }}
            >
              Văn bản
            </button>
          </div>
        )}
      </div>

      {err && <div className="banner banner-warning">{err}</div>}

      <div
        className={`reader-body${view === "page" && zoom > 100 ? " zoomed" : ""}`}
        ref={body}
        onScroll={onScroll}
        style={{ ["--page-zoom" as string]: `${zoom}%` }}
      >
        {range && range[0] > 1 && (
          <button type="button" className="btn-link" disabled={loading} onClick={() => void load(Math.max(1, range[0] - STEP), range[0] - 1)}>
            ↑ Đọc {unit.toLowerCase()} trước
          </button>
        )}
        {ordered.map((p) => (
          <section key={p} data-page={p} className={`reader-page${p === target.page && target.highlight ? " target" : ""}`}>
            {(view === "text" || ordered.length > 1) && (
              <div className="reader-page-no">
                {unit} {p}
              </div>
            )}
            {view === "page" ? (
              <PageImage
                path={`/documents/${target.documentId}/versions/${target.versionId}/pages/${p}/image?width=1000`}
                alt={`${unit} ${p} — ${target.title}`}
                markRef={p === target.page ? mark : undefined}
                fallback={<PageText text={pages.get(p) ?? ""} highlight={p === target.page ? target.highlight : null} />}
              />
            ) : (
              <PageText
                text={pages.get(p) ?? ""}
                highlight={p === target.page ? target.highlight : null}
                markRef={p === target.page ? mark : undefined}
              />
            )}
            {view === "page" && p === target.page && target.highlight && (
              <div className="page-quote">
                <span className="muted small">Đoạn được trích trên trang này:</span> {target.highlight}
              </div>
            )}
          </section>
        ))}
        {range && (pageCount === null || range[1] < pageCount) && (
          <button type="button" className="btn-link more-pages" disabled={loading} onClick={() => void load(range[1] + 1, range[1] + STEP)}>
            {loading ? "Đang tải…" : `↓ Tải thêm ${unit.toLowerCase()}`}
          </button>
        )}
        {loading && !range && <div className="skeleton" />}
      </div>

      {target.canDownload ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void openFile(`/documents/${target.documentId}/versions/${target.versionId}/download`)}
        >
          Mở bản gốc
        </button>
      ) : (
        <p className="muted small">Bạn có quyền đọc nhưng không có quyền tải bản gốc.</p>
      )}
    </div>
  );
}

/** Ảnh trang PDF tải kèm Bearer (không có link công khai); lỗi render → dùng text trích xuất (FR-04.4). */
function PageImage({
  path,
  alt,
  markRef,
  fallback,
}: {
  path: string;
  alt: string;
  markRef?: React.RefObject<HTMLElement | null>;
  fallback: React.ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    fetchObjectUrl(path)
      .then((u) => {
        objectUrl = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed)
    return (
      <>
        <p className="muted small">Không hiển thị được trang gốc — đang hiện văn bản trích xuất.</p>
        {fallback}
      </>
    );
  return (
    <div className="page-image" ref={markRef as React.RefObject<HTMLDivElement>}>
      {url ? <img src={url} alt={alt} /> : <div className="skeleton page-skeleton" />}
    </div>
  );
}

function PageText({
  text,
  highlight,
  markRef,
}: {
  text: string;
  highlight: string | null;
  markRef?: React.RefObject<HTMLElement | null>;
}) {
  if (!text) return <p className="muted small">(Trang không có nội dung học — mục lục, chỉ mục hoặc trang trắng đã được lọc)</p>;
  const i = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || i < 0) return <div className="reader-text">{text}</div>;
  return (
    <div className="reader-text">
      {text.slice(0, i)}
      <mark ref={markRef as React.RefObject<HTMLElement>}>{highlight}</mark>
      {text.slice(i + highlight.length)}
    </div>
  );
}
