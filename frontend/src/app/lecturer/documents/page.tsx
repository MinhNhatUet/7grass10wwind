"use client";

import { type FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useManagedCourse } from "@/components/useManagedCourse";
import { INTEGRITY_LABEL, StateBadge, type VersionFull, VersionPreview } from "@/components/VersionPreview";
import { ApiError, api, json, newRequestId } from "@/lib/api";
import { DOC_TYPE_LABEL, MSG, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// UI-07 — Quản lý tài liệu Giảng viên (FR-06, FR-07): upload → xử lý → xem trước → gửi duyệt.

const IN_PROGRESS = ["Processing", "Approved", "Indexing"];

interface UploadForm {
  title: string;
  doc_type: string;
  version_label: string;
  chapter: string;
  authors: string;
  provenance: string;
  usage_permission: "confirmed" | "pending";
  acl_roles: string[];
  download_allowed: boolean;
  integrity_label: string;
}

const EMPTY: UploadForm = {
  title: "",
  doc_type: "textbook",
  version_label: "1",
  chapter: "",
  authors: "",
  provenance: "",
  usage_permission: "pending",
  acl_roles: ["student", "lecturer", "reviewer"],
  download_allowed: false,
  integrity_label: "",
};

function DocumentsInner() {
  const { profile, courses, signOut, handleAuthError } = useSession();
  const { courseId, managed, setCourse } = useManagedCourse(courses, "/lecturer/documents");
  const course = managed.find((c) => c.id === courseId);
  const [items, setItems] = useState<VersionFull[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState<{ documentId: string | null; title?: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    try {
      const q = filter ? `&state=${filter}` : "";
      setItems((await api<{ items: VersionFull[] }>(`/manage/versions?course_id=${courseId}${q}`)).items);
    } catch (e) {
      if (!handleAuthError(e)) setMsg({ kind: "error", text: e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError });
    }
  }, [courseId, filter, handleAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Job nền: tự làm mới khi còn bản đang xử lý (FR-07.1 — rời trang quay lại vẫn xem được)
  useEffect(() => {
    if (!items.some((i) => IN_PROGRESS.includes(i.state))) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [items, load]);

  async function act(path: string, body: unknown, ok: string) {
    setMsg(null);
    try {
      await api(path, { method: "POST", body: json(body) });
      setMsg({ kind: "info", text: ok });
      void load();
    } catch (e) {
      if (!handleAuthError(e)) setMsg({ kind: "error", text: e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError });
    }
  }

  const noAccess = courses !== null && managed.length === 0;
  return (
    <AppShell profile={profile} courses={courses} courseId={courseId} onSignOut={signOut}>
      <main className="container wide">
        <div className="row between">
          <h2>Tài liệu {course ? `— ${course.name}` : ""}</h2>
          {managed.length > 1 && (
            <select value={courseId ?? ""} onChange={(e) => setCourse(e.target.value)} aria-label="Môn quản lý">
              {managed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {noAccess && <div className="banner banner-info">Bạn chưa được phân công quản lý tài liệu môn nào.</div>}
        {msg && <div className={`banner banner-${msg.kind === "error" ? "error" : "info"}`}>{msg.text}</div>}

        {course?.can_upload && (
          <button type="button" onClick={() => setShowUpload({ documentId: null })}>
            + Tải tài liệu lên
          </button>
        )}
        {showUpload && courseId && (
          <UploadDialog
            courseId={courseId}
            documentId={showUpload.documentId}
            title={showUpload.title}
            onClose={() => setShowUpload(null)}
            onDone={(text) => {
              setShowUpload(null);
              setMsg({ kind: "info", text });
              void load();
            }}
            onAuthError={handleAuthError}
          />
        )}

        <div className="row">
          <label className="small">
            Trạng thái{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Tất cả</option>
              {["Processing", "Draft", "NeedsReview", "PendingApproval", "Rejected", "Indexing", "Published", "Failed", "Withdrawn", "Archived"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tài liệu</th>
                <th>Bản</th>
                <th>Trạng thái</th>
                <th>Nhãn</th>
                <th>Cập nhật</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Chưa có tài liệu.
                  </td>
                </tr>
              )}
              {items.map((v) => (
                <tr key={v.version_id} className={selected === v.version_id ? "selected" : ""}>
                  <td>
                    {v.title}
                    <div className="muted small">{DOC_TYPE_LABEL[v.doc_type] ?? v.doc_type}</div>
                  </td>
                  <td>
                    {v.version_label} <span className="muted small">r{v.revision}</span>
                    {v.is_current && <div className="small">hiện hành</div>}
                  </td>
                  <td>
                    <StateBadge state={v.state} />
                    {v.quality_warnings.length > 0 && <div className="warn small">⚠ {v.quality_warnings.length} cảnh báo</div>}
                    {!!v.chunk_count && ["Draft", "NeedsReview", "PendingApproval", "Failed"].includes(v.state) && (
                      <div className="muted small">
                        {v.embedded_count === v.chunk_count
                          ? "✓ Đã embedding xong — duyệt là phát hành ngay"
                          : `Embedding ${v.embedded_count ?? 0}/${v.chunk_count} đoạn`}
                      </div>
                    )}
                  </td>
                  <td className="small">{INTEGRITY_LABEL[v.integrity_label] ?? (v.integrity_label || MSG.unlabeled)}</td>
                  <td className="small">{v.updated_at?.slice(0, 16).replace("T", " ")}</td>
                  <td className="actions-cell">
                    <button type="button" className="btn-secondary" onClick={() => setSelected(selected === v.version_id ? null : v.version_id)}>
                      {selected === v.version_id ? "Đóng" : "Xem"}
                    </button>
                    {course?.can_upload && ["Draft", "NeedsReview", "Rejected"].includes(v.state) && (
                      <button
                        type="button"
                        onClick={() => {
                          const ack =
                            v.state !== "NeedsReview" ||
                            confirm("Bản này có trang cần xem lại. Xác nhận đã kiểm tra và chấp nhận các cảnh báo?");
                          if (ack)
                            void act(`/versions/${v.version_id}/submit`, { acknowledge_warnings: v.state === "NeedsReview" }, "Đã gửi duyệt.");
                        }}
                      >
                        Gửi duyệt
                      </button>
                    )}
                    {v.state === "Failed" && (
                      <button type="button" className="btn-secondary" onClick={() => void act(`/versions/${v.version_id}/retry`, {}, "Đã chạy lại.")}>
                        Thử lại
                      </button>
                    )}
                    {course?.can_upload && v.is_current && (
                      <button type="button" className="btn-secondary" onClick={() => setShowUpload({ documentId: v.document_id, title: v.title })}>
                        Phiên bản mới
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && <VersionPreview versionId={selected} />}
      </main>
    </AppShell>
  );
}

function UploadDialog({
  courseId,
  documentId,
  title,
  onClose,
  onDone,
  onAuthError,
}: {
  courseId: string;
  documentId: string | null;
  title?: string;
  onClose: () => void;
  onDone: (msg: string) => void;
  onAuthError: (e: unknown) => boolean;
}) {
  const [form, setForm] = useState<UploadForm>({ ...EMPTY, title: title ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key] = useState(newRequestId);

  const set = <K extends keyof UploadForm>(k: K, v: UploadForm[K]) => setForm({ ...form, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    if (!form.integrity_label) {
      setErr(MSG.unlabeled);
      return;
    }
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    if (!documentId) fd.append("course_id", courseId);
    fd.append("metadata", json({ ...form, chapter: form.chapter || null, authors: form.authors || null }));
    fd.append("file", file);
    try {
      const r = await api<{ state: string }>(documentId ? `/documents/${documentId}/versions` : "/documents", {
        method: "POST",
        body: fd,
        idempotencyKey: key,
      });
      onDone(`Đã nhận tệp, đang xử lý (${r.state}). Trang sẽ tự cập nhật.`);
    } catch (e2) {
      if (!onAuthError(e2)) setErr(e2 instanceof ApiError ? (e2.detail ?? errorMessage(e2.code)) : MSG.serviceError);
      setBusy(false);
    }
  }

  return (
    <form className="card upload" onSubmit={submit}>
      <h3>{documentId ? `Phiên bản mới — ${title}` : "Tải tài liệu lên"}</h3>
      <label>
        Tệp PDF/PPTX *
        <input type="file" accept=".pdf,.pptx" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {!documentId && (
        <label>
          Tiêu đề *
          <input value={form.title} required onChange={(e) => set("title", e.target.value)} />
        </label>
      )}
      <div className="form-grid">
        <label>
          Loại *
          <select value={form.doc_type} onChange={(e) => set("doc_type", e.target.value)}>
            {Object.entries(DOC_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phiên bản *
          <input value={form.version_label} required onChange={(e) => set("version_label", e.target.value)} />
        </label>
        <label>
          Chương/chủ đề
          <input value={form.chapter} onChange={(e) => set("chapter", e.target.value)} />
        </label>
        <label>
          Tác giả/đơn vị
          <input value={form.authors} onChange={(e) => set("authors", e.target.value)} />
        </label>
      </div>
      <label>
        Nguồn gốc *
        <input value={form.provenance} required placeholder="Ai cung cấp, lấy từ đâu" onChange={(e) => set("provenance", e.target.value)} />
      </label>
      <label>
        Quyền sử dụng/xử lý AI *
        <select value={form.usage_permission} onChange={(e) => set("usage_permission", e.target.value as UploadForm["usage_permission"])}>
          <option value="pending">Chưa xác nhận (chỉ giữ nháp)</option>
          <option value="confirmed">Đã xác nhận được phép dùng</option>
        </select>
      </label>
      <fieldset className="inline">
        <legend>Đối tượng được đọc *</legend>
        {[
          ["student", "Sinh viên"],
          ["lecturer", "Giảng viên"],
          ["reviewer", "GV duyệt"],
        ].map(([r, l]) => (
          <label key={r}>
            <input
              type="checkbox"
              checked={form.acl_roles.includes(r)}
              onChange={(e) =>
                set("acl_roles", e.target.checked ? [...form.acl_roles, r] : form.acl_roles.filter((x) => x !== r))
              }
            />{" "}
            {l}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" checked={form.download_allowed} onChange={(e) => set("download_allowed", e.target.checked)} /> Cho phép tải
        bản gốc
      </label>
      <label>
        Nhãn học liệu/bài tập/đáp án *
        <select value={form.integrity_label} onChange={(e) => set("integrity_label", e.target.value)}>
          <option value="">— Chọn nhãn —</option>
          {Object.entries(INTEGRITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {err && <div className="banner banner-error">{err}</div>}
      <div className="row">
        <button type="submit" disabled={busy || !file}>
          {busy ? "Đang tải lên…" : "Tải lên"}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Hủy
        </button>
      </div>
    </form>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsInner />
    </Suspense>
  );
}
