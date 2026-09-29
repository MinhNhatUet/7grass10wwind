"use client";

import { type FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useManagedCourse } from "@/components/useManagedCourse";
import { INTEGRITY_LABEL, StateBadge, type VersionFull, VersionPreview } from "@/components/VersionPreview";
import { ApiError, api, json, newRequestId } from "@/lib/api";
import { DOC_TYPE_LABEL, MSG, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";
import gsap from "gsap";

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

  useEffect(() => {
    if (items.length > 0) {
      gsap.fromTo(
        ".doc-row",
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.05, ease: "power2.out" }
      );
    }
  }, [items.length]);

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
      <main className="mx-auto max-w-6xl p-6 lg:p-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Tài liệu</h2>
            {course && <p className="text-muted-foreground mt-1">{course.name}</p>}
          </div>
          {managed.length > 1 && (
            <select 
              value={courseId ?? ""} 
              onChange={(e) => setCourse(e.target.value)} 
              aria-label="Môn quản lý"
              className="bg-secondary/50 border-0 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary hover:bg-secondary cursor-pointer"
            >
              {managed.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </header>

        {noAccess && <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-xl text-sm">Bạn chưa được phân công quản lý tài liệu môn nào.</div>}
        {msg && <div className={`px-4 py-3 rounded-xl text-sm border ${msg.kind === "error" ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-primary/10 border-primary/20 text-primary"}`}>{msg.text}</div>}

        <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/20 p-4 rounded-2xl border border-border">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Trạng thái:</span>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer hover:bg-secondary focus:ring-2 focus:ring-primary"
            >
              <option value="">Tất cả</option>
              {["Processing", "Draft", "NeedsReview", "PendingApproval", "Rejected", "Indexing", "Published", "Failed", "Withdrawn", "Archived"].map(
                (s) => <option key={s} value={s}>{s}</option>,
              )}
            </select>
          </div>

          {course?.can_upload && (
            <button 
              type="button" 
              onClick={() => setShowUpload({ documentId: null })}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow active:scale-95 text-sm"
            >
              + Tải tài liệu lên
            </button>
          )}
        </div>

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

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Tài liệu</th>
                  <th className="px-5 py-3 font-medium">Bản</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                  <th className="px-5 py-3 font-medium">Nhãn</th>
                  <th className="px-5 py-3 font-medium">Cập nhật</th>
                  <th className="px-5 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      Chưa có tài liệu.
                    </td>
                  </tr>
                )}
                {items.map((v) => (
                  <tr key={v.version_id} className={`doc-row transition-colors hover:bg-secondary/30 ${selected === v.version_id ? "bg-secondary/50" : ""}`}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{v.title}</div>
                      <div className="text-muted-foreground text-xs mt-0.5">{DOC_TYPE_LABEL[v.doc_type] ?? v.doc_type}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{v.version_label}</span> 
                        <span className="text-muted-foreground text-xs bg-secondary px-1.5 py-0.5 rounded">r{v.revision}</span>
                      </div>
                      {v.is_current && <div className="text-[11px] text-primary mt-1 font-medium bg-primary/10 w-fit px-1.5 rounded">hiện hành</div>}
                    </td>
                    <td className="px-5 py-3 space-y-1.5">
                      <StateBadge state={v.state} />
                      {v.quality_warnings.length > 0 && <div className="text-amber-600 dark:text-amber-400 text-[11px] font-medium bg-amber-500/10 w-fit px-1.5 py-0.5 rounded">⚠ {v.quality_warnings.length} cảnh báo</div>}
                      {!!v.chunk_count && ["Draft", "NeedsReview", "PendingApproval", "Failed"].includes(v.state) && (
                        <div className="text-muted-foreground text-[11px]">
                          {v.embedded_count === v.chunk_count
                            ? "✓ Đã embedding xong"
                            : `Embedding ${v.embedded_count ?? 0}/${v.chunk_count} đoạn`}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-[150px] truncate" title={INTEGRITY_LABEL[v.integrity_label] ?? (v.integrity_label || MSG.unlabeled)}>
                      {INTEGRITY_LABEL[v.integrity_label] ?? (v.integrity_label || MSG.unlabeled)}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{v.updated_at?.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-5 py-3 text-right space-x-2">
                      <button 
                        type="button" 
                        className="bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors text-xs font-medium cursor-pointer" 
                        onClick={() => setSelected(selected === v.version_id ? null : v.version_id)}
                      >
                        {selected === v.version_id ? "Đóng" : "Xem"}
                      </button>
                      {course?.can_upload && ["Draft", "NeedsReview", "Rejected"].includes(v.state) && (
                        <button
                          type="button"
                          className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-lg transition-colors text-xs font-medium cursor-pointer border-0 shadow-sm"
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
                        <button 
                          type="button" 
                          className="bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors text-xs font-medium cursor-pointer" 
                          onClick={() => void act(`/versions/${v.version_id}/retry`, {}, "Đã chạy lại.")}
                        >
                          Thử lại
                        </button>
                      )}
                      {course?.can_upload && v.is_current && (
                        <button 
                          type="button" 
                          className="bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors text-xs font-medium cursor-pointer" 
                          onClick={() => setShowUpload({ documentId: v.document_id, title: v.title })}
                        >
                          Bản mới
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selected && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mt-8 space-y-5 doc-preview">
            <VersionPreview versionId={selected} />
          </div>
        )}
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
