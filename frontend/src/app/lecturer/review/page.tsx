"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useManagedCourse } from "@/components/useManagedCourse";
import { StateBadge, type VersionFull, VersionPreview } from "@/components/VersionPreview";
import { ApiError, api, json, newRequestId } from "@/lib/api";
import { MSG, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// UI-08 — Duyệt tài liệu (FR-08): người duyệt được phân công, khác người tải, quyết định theo revision.

function ReviewInner() {
  const { profile, courses, signOut, handleAuthError } = useSession();
  const { courseId, managed, setCourse } = useManagedCourse(courses, "/lecturer/review", "review");
  const [tab, setTab] = useState<"queue" | "published">("queue");
  const [items, setItems] = useState<VersionFull[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [info, setInfo] = useState<{ version: VersionFull; can_decide: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    const state = tab === "queue" ? "PendingApproval" : "Published";
    try {
      setItems((await api<{ items: VersionFull[] }>(`/manage/versions?course_id=${courseId}&state=${state}`)).items);
    } catch (e) {
      if (!handleAuthError(e)) setMsg({ kind: "error", text: e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError });
    }
  }, [courseId, tab, handleAuthError]);

  useEffect(() => {
    void load();
    setSelected(null);
  }, [load]);

  const onLoaded = useCallback((d: { version: VersionFull; can_decide: boolean }) => setInfo(d), []);

  async function decide(decision: "approve" | "reject") {
    if (!info) return;
    if (decision === "reject" && !reason.trim()) {
      setMsg({ kind: "error", text: "Từ chối cần có lý do." });
      return;
    }
    setMsg(null);
    try {
      await api(`/versions/${info.version.version_id}/decision`, {
        method: "POST",
        body: json({ decision, reason: reason || null, reviewed_revision: info.version.revision }),
        idempotencyKey: newRequestId(),
      });
      setMsg({
        kind: "info",
        text: decision === "approve" ? "Đã duyệt — đang index, tài liệu chỉ xuất hiện trong Hub sau khi phát hành." : "Đã từ chối.",
      });
      setSelected(null);
      setReason("");
      void load();
    } catch (e) {
      if (!handleAuthError(e)) setMsg({ kind: "error", text: e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError });
    }
  }

  async function withdraw() {
    if (!info || !reason.trim()) {
      setMsg({ kind: "error", text: "Thu hồi cần có lý do." });
      return;
    }
    if (!confirm("Thu hồi sẽ chặn phục vụ tài liệu này ngay lập tức. Tiếp tục?")) return;
    try {
      await api(`/versions/${info.version.version_id}/withdraw`, { method: "POST", body: json({ reason }) });
      setMsg({ kind: "info", text: "Đã thu hồi — nguồn không còn được phục vụ." });
      setSelected(null);
      setReason("");
      void load();
    } catch (e) {
      if (!handleAuthError(e)) setMsg({ kind: "error", text: e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError });
    }
  }

  const course = managed.find((c) => c.id === courseId);
  return (
    <AppShell profile={profile} courses={courses} courseId={courseId} onSignOut={signOut}>
      <main className="container wide">
        <div className="row between">
          <h2>Duyệt tài liệu {course ? `— ${course.name}` : ""}</h2>
          {managed.length > 1 && (
            <select value={courseId ?? ""} onChange={(e) => setCourse(e.target.value)} aria-label="Môn duyệt">
              {managed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {courses !== null && managed.length === 0 && <div className="banner banner-info">{MSG.notAssignedReview}</div>}
        {msg && <div className={`banner banner-${msg.kind === "error" ? "error" : "info"}`}>{msg.text}</div>}

        <div className="chips">
          <button type="button" className={`chip${tab === "queue" ? " active" : ""}`} onClick={() => setTab("queue")}>
            Hàng đợi duyệt
          </button>
          <button type="button" className={`chip${tab === "published" ? " active" : ""}`} onClick={() => setTab("published")}>
            Đang phát hành (thu hồi)
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tài liệu</th>
                <th>Bản</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {tab === "queue" ? "Không có tài liệu chờ duyệt." : "Chưa có tài liệu phát hành."}
                  </td>
                </tr>
              )}
              {items.map((v) => (
                <tr key={v.version_id} className={selected === v.version_id ? "selected" : ""}>
                  <td>{v.title}</td>
                  <td>
                    {v.version_label} <span className="muted small">r{v.revision}</span>
                  </td>
                  <td>
                    <StateBadge state={v.state} />
                  </td>
                  <td className="small">{v.updated_at?.slice(0, 16).replace("T", " ")}</td>
                  <td>
                    <button type="button" className="btn-secondary" onClick={() => setSelected(v.version_id)}>
                      Mở
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card">
            <VersionPreview versionId={selected} onLoaded={onLoaded} />
            <label>
              Lý do {tab === "queue" ? "(bắt buộc khi từ chối)" : "thu hồi (bắt buộc)"}
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {tab === "queue" && info && !info.can_decide && (
              <div className="banner banner-warning">
                {info.version.uploader_id === profile?.user.id
                  ? "Người tải lên không được tự duyệt tài liệu của mình."
                  : MSG.notAssignedReview}
              </div>
            )}
            <div className="row">
              {tab === "queue" ? (
                <>
                  <button type="button" disabled={!info?.can_decide} onClick={() => void decide("approve")}>
                    Duyệt (revision {info?.version.revision})
                  </button>
                  <button type="button" className="btn-danger" disabled={!info?.can_decide} onClick={() => void decide("reject")}>
                    Từ chối
                  </button>
                </>
              ) : (
                <button type="button" className="btn-danger" onClick={() => void withdraw()}>
                  Thu hồi
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewInner />
    </Suspense>
  );
}
