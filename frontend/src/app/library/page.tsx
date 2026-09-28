"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell, Icon } from "@/components/AppShell";
import { type ReaderTarget, SourceReader } from "@/components/SourceReader";
import { ApiError, type LibraryItem, api, json, openFile } from "@/lib/api";
import { DOC_TYPE_LABEL, MSG, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// Thư viện môn học (FR-04.1–04.5): duyệt tài liệu đã phát hành trong các môn được cấp và đọc bằng trình xem
// kiểu NotebookLM. Danh sách + mỗi lần đọc trang đều do server lọc quyền (BR-02, BR-03); không phải RAG.

function toTarget(d: LibraryItem, page: number): ReaderTarget {
  return {
    documentId: d.document_id,
    versionId: d.version_id,
    title: d.title,
    versionLabel: d.version_label,
    page,
    locatorType: d.file_type === "pptx" ? "slide" : "page",
    highlight: null,
    canDownload: d.can_download,
  };
}

function LibraryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile, courses, signOut, handleAuthError } = useSession();

  const [courseId, setCourseId] = useState<string | null>(params.get("course"));
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState("");
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [reader, setReader] = useState<ReaderTarget | null>(null);

  // Môn mặc định: môn đầu tiên server cho phép; môn trên URL không thuộc danh sách thì bỏ qua (BR-02)
  useEffect(() => {
    if (!courses?.length) return;
    if (!courseId || !courses.some((c) => c.id === courseId)) setCourseId(courses[0].id);
  }, [courses, courseId]);

  const load = useCallback(async () => {
    if (!courseId) return;
    setError(null);
    const qs = new URLSearchParams({ course_id: courseId, page_size: "100" });
    if (query) qs.set("q", query);
    if (docType) qs.set("doc_type", docType);
    try {
      setItems((await api<{ items: LibraryItem[] }>(`/documents?${qs}`)).items);
    } catch (err) {
      if (!handleAuthError(err)) {
        setItems([]);
        setError(err instanceof ApiError ? errorMessage(err.code) : MSG.serviceError);
      }
    }
  }, [courseId, query, docType, handleAuthError]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  function changeCourse(id: string) {
    setCourseId(id);
    setOpen(null);
    setReader(null);
    router.replace(`/library?course=${encodeURIComponent(id)}`);
  }

  function read(d: LibraryItem, page = 1) {
    setOpen(d);
    setReader(toTarget(d, page));
  }

  // "Hỏi về tài liệu này": server tạo hội thoại gắn tài liệu (tự lấy môn, kiểm quyền — D-33) rồi mở Hội thoại
  const [asking, setAsking] = useState<string | null>(null);
  async function askAbout(d: LibraryItem) {
    setAsking(d.document_id);
    try {
      const conv = await api<{ conversation_id: string }>("/conversations", {
        method: "POST",
        body: json({ document_id: d.document_id }),
      });
      router.push(`/chat?conv=${encodeURIComponent(conv.conversation_id)}`);
    } catch (err) {
      if (!handleAuthError(err)) setError(err instanceof ApiError ? errorMessage(err.code) : MSG.serviceError);
      setAsking(null);
    }
  }

  const noCourses = courses !== null && courses.length === 0;

  return (
    <AppShell
      profile={profile}
      courses={courses}
      courseId={courseId}
      onCourseChange={changeCourse}
      onSignOut={signOut}
    >
      <div className={`library-layout${open ? " has-doc" : ""}`}>
        <section className="library-main">
          <div className="library-head">
            <h2>Thư viện tài liệu</h2>
            <p className="muted small">Tài liệu đã phát hành trong môn bạn được cấp.</p>
          </div>
          {noCourses && (
            <div className="banner banner-info">
              {profile?.user.role === "admin" ? "Tài khoản quản trị không có quyền nội dung." : MSG.noCourses}
            </div>
          )}
          {!noCourses && (
            <>
              <form
                className="library-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(q.trim());
                }}
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onBlur={() => setQuery(q.trim())}
                  placeholder="Tìm tài liệu…"
                  aria-label="Tìm theo tên tài liệu"
                />
                <select value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Loại tài liệu">
                  <option value="">Tất cả loại</option>
                  {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </form>
              {error && <div className="banner banner-warning">{error}</div>}
              {items === null && !error && <div className="skeleton" />}
              {items?.length === 0 && !error && (
                <p className="muted small">
                  {query || docType
                    ? "Không tìm thấy tài liệu phù hợp. Thử bỏ bớt bộ lọc hoặc đổi từ khóa."
                    : "Môn này chưa có tài liệu đã phát hành."}
                </p>
              )}
              <ul className="library-list">
                {items?.map((d) => (
                  <li key={d.version_id}>
                    <button
                      type="button"
                      className={`library-item${open?.version_id === d.version_id ? " active" : ""}`}
                      onClick={() => read(d)}
                    >
                      <span className="doc-icon" aria-hidden="true">
                        <Icon name="docs" size={18} />
                      </span>
                      <span className="library-item-body">
                        <strong>{d.title}</strong>
                        <span className="muted small">
                          <span className="state state-Published">Đã phát hành</span>{" "}
                          {d.page_count ? `${d.page_count} ${d.file_type === "pptx" ? "slide" : "tr"}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={`library-reader${reader ? " open" : ""}`} aria-label="Đọc tài liệu">
          {reader && open ? (
            <SourceReader
              target={reader}
              defaultView="page"
              onClose={() => {
                setReader(null);
                setOpen(null);
              }}
            />
          ) : (
            <div className="panel-empty">
              <span className="empty-icon" aria-hidden="true">
                <Icon name="library" size={22} />
              </span>
              <h3>Chưa mở tài liệu</h3>
              <p className="muted small">Chọn một tài liệu bên trái để xem từng trang.</p>
            </div>
          )}
        </section>

        {open && (
          <aside className="library-info" aria-label="Thông tin tài liệu">
            <p className="side-label">Tài liệu</p>
            <h3>{open.title}</h3>
            <span className="state state-Published">Đã phát hành</span>
            <dl className="info-list">
              <dt>Loại</dt>
              <dd>{DOC_TYPE_LABEL[open.doc_type] ?? open.doc_type}</dd>
              <dt>Phiên bản</dt>
              <dd>{open.version_label}</dd>
              {open.chapter && (
                <>
                  <dt>Chương</dt>
                  <dd>{open.chapter}</dd>
                </>
              )}
              {open.page_count && (
                <>
                  <dt>Số {open.file_type === "pptx" ? "slide" : "trang"}</dt>
                  <dd>{open.page_count}</dd>
                </>
              )}
              {open.published_at && (
                <>
                  <dt>Phát hành</dt>
                  <dd>{open.published_at.slice(0, 10)}</dd>
                </>
              )}
            </dl>
            <div className="info-actions">
              <button type="button" disabled={asking !== null} onClick={() => void askAbout(open)}>
                {asking === open.document_id ? "Đang mở…" : "Hỏi về tài liệu này"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </AppShell>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryInner />
    </Suspense>
  );
}
