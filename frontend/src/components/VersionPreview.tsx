"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, openFile } from "@/lib/api";
import { MSG, STATE_LABEL, errorMessage } from "@/lib/messages";

export interface VersionFull {
  chunk_count?: number; // D-34: tiến độ embedding (chỉ có ở danh sách quản lý)
  embedded_count?: number;
  document_id: string;
  version_id: string;
  course_id: string;
  title: string;
  doc_type: string;
  version_label: string;
  chapter: string | null;
  file_type: string;
  page_count: number | null;
  state: string;
  published_at: string | null;
  revision: number;
  authors: string | null;
  provenance: string;
  usage_permission: string;
  acl_roles: string[];
  download_allowed: boolean;
  integrity_label: string;
  uploader_id: string;
  original_filename: string;
  size_bytes: number;
  quality_warnings: { locator_type?: string; locator_value?: number; issue: string }[];
  reject_reason: string | null;
  withdraw_reason: string | null;
  is_current: boolean;
  emergency_locked: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface PreviewData {
  version: VersionFull;
  pages: { locator: { type: string; value: number }; text: string; quality: string }[];
  page_from: number;
  page_to: number;
  approvals: { decision: string; reason: string | null; reviewed_revision: number; created_at: string | null }[];
  can_decide: boolean;
  can_edit: boolean;
}

export const INTEGRITY_LABEL: Record<string, string> = {
  learning_material: "Học liệu",
  exercise_ungraded: "Bài tập không tính điểm",
  exercise_graded: "Bài tập tính điểm (không phục vụ SV)",
  answer_key: "Đáp án (không phục vụ SV)",
};

export function StateBadge({ state }: { state: string }) {
  return <span className={`state state-${state}`}>{STATE_LABEL[state] ?? state}</span>;
}

/** FR-07.5: bản gốc + text theo trang/slide, metadata, ACL, nhãn, cảnh báo — chỉ người quản lý/duyệt. */
export function VersionPreview({
  versionId,
  onLoaded,
}: {
  versionId: string;
  onLoaded?: (d: { version: VersionFull; can_decide: boolean; can_edit: boolean }) => void;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [from, setFrom] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<PreviewData>(`/review/versions/${versionId}/preview?page_from=${from}&page_to=${from + 9}`);
      setData(d);
      onLoaded?.(d);
    } catch (e) {
      setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }, [versionId, from, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <div className="banner banner-error">{err}</div>;
  if (!data) return <div className="skeleton" />;
  const v = data.version;
  const total = v.page_count ?? 0;
  return (
    <div className="preview">
      <div className="meta-grid">
        <div>
          <strong>{v.title}</strong> · bản {v.version_label} · <StateBadge state={v.state} /> · revision {v.revision}
        </div>
        <div className="small">
          Loại: {v.doc_type} · Tệp: {v.original_filename} ({v.file_type}, {total} {v.file_type === "pdf" ? "trang" : "slide"})
        </div>
        <div className="small">Nguồn gốc: {v.provenance}</div>
        {v.authors && <div className="small">Tác giả: {v.authors}</div>}
        <div className="small">
          Quyền sử dụng: <strong>{v.usage_permission === "confirmed" ? "đã xác nhận" : "chưa xác nhận"}</strong> · Đối tượng đọc:{" "}
          {v.acl_roles.join(", ") || "— (chưa có ACL)"} · Cho tải bản gốc: {v.download_allowed ? "có" : "không"}
        </div>
        <div className="small">Nhãn: {INTEGRITY_LABEL[v.integrity_label] ?? v.integrity_label}</div>
        {v.reject_reason && <div className="warn small">Lý do từ chối: {v.reject_reason}</div>}
        {v.withdraw_reason && <div className="warn small">Lý do thu hồi: {v.withdraw_reason}</div>}
        {v.quality_warnings.length > 0 && (
          <div className="warn small">
            ⚠ {v.quality_warnings.length} vị trí cần xem lại:{" "}
            {v.quality_warnings
              .slice(0, 20)
              .map((w) => (w.locator_value ? `${w.locator_type === "slide" ? "slide" : "tr."} ${w.locator_value}` : w.issue))
              .join(", ")}
            {v.quality_warnings.length > 20 && "…"}
          </div>
        )}
        <button type="button" className="btn-secondary" onClick={() => void openFile(`/review/versions/${v.version_id}/original`)}>
          Mở bản gốc
        </button>
      </div>

      <div className="row between">
        <strong>Text trích xuất</strong>
        <span className="row">
          <button type="button" className="btn-secondary" disabled={from <= 1} onClick={() => setFrom(Math.max(1, from - 10))}>
            ‹
          </button>
          <span className="small">
            {from}–{Math.min(from + 9, total || from + 9)} / {total}
          </span>
          <button type="button" className="btn-secondary" disabled={from + 10 > total} onClick={() => setFrom(from + 10)}>
            ›
          </button>
        </span>
      </div>
      <div className="pages">
        {data.pages.length === 0 && <p className="muted small">Không có text ở các trang này.</p>}
        {data.pages.map((p) => (
          <div key={p.locator.value} className={`page-text${p.quality !== "ok" ? " low" : ""}`}>
            <div className="muted small">
              {p.locator.type === "page" ? "Trang" : "Slide"} {p.locator.value}
              {p.quality !== "ok" && " · chất lượng thấp"}
            </div>
            <pre>{p.text}</pre>
          </div>
        ))}
      </div>

      {data.approvals.length > 0 && (
        <div className="small">
          <strong>Lịch sử quyết định:</strong>
          <ul>
            {data.approvals.map((a, i) => (
              <li key={i}>
                {a.decision === "approve" ? "Duyệt" : "Từ chối"} (revision {a.reviewed_revision}) — {a.reason ?? ""} ·{" "}
                {a.created_at}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
