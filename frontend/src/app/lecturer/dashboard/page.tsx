"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useManagedCourse } from "@/components/useManagedCourse";
import { ApiError, api, json } from "@/lib/api";
import { FEEDBACK_LABEL, MSG, STATE_LABEL, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// UI-09 — Dashboard Giảng viên (FR-12): chỉ môn phụ trách; không mở hội thoại riêng; số chưa đo ghi "chưa có dữ liệu".

interface Overview {
  window_days: number;
  documents_by_state: Record<string, number>;
  review_queue: number;
  feedback_by_status: Record<string, number>;
  usage: { total_queries: number; by_status: Record<string, number>; latency_p95_ms: number | null };
  source_gaps: { insufficient_evidence: number; note: string };
  eval: unknown;
}

interface FeedbackItem {
  id: string;
  type: string;
  note: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
  shared: { question: string | null; answer: string | null } | null;
}

interface HistoryItem {
  action: string;
  object_type: string;
  object_id: string;
  actor: string;
  reason: string | null;
  created_at: string;
}

const TABS = { overview: "Thống kê", feedback: "Phản hồi", history: "Lịch sử" } as const;

function DashboardInner() {
  const { profile, courses, signOut, handleAuthError } = useSession();
  const { courseId, managed, setCourse } = useManagedCourse(courses, "/lecturer/dashboard");
  const [tab, setTab] = useState<keyof typeof TABS>("overview");
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [fbFilter, setFbFilter] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setErr(null);
    try {
      if (tab === "overview") setOverview(await api<Overview>(`/dashboard/overview?course_id=${courseId}&days=${days}`));
      if (tab === "feedback")
        setFeedback((await api<{ items: FeedbackItem[] }>(`/dashboard/feedback?course_id=${courseId}${fbFilter ? `&status=${fbFilter}` : ""}`)).items);
      if (tab === "history") setHistory((await api<{ items: HistoryItem[] }>(`/dashboard/history?course_id=${courseId}`)).items);
    } catch (e) {
      if (!handleAuthError(e)) setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }, [courseId, tab, days, fbFilter, handleAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateFeedback(id: string, status: string) {
    const note = status === "Resolved" ? prompt("Ghi chú xử lý (tùy chọn)") : null;
    try {
      await api(`/dashboard/feedback/${id}`, { method: "PATCH", body: json({ status, resolution_note: note }) });
      void load();
    } catch (e) {
      if (!handleAuthError(e)) setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }

  const course = managed.find((c) => c.id === courseId);
  const u = overview?.usage;
  return (
    <AppShell profile={profile} courses={courses} courseId={courseId} onSignOut={signOut}>
      <main className="container wide">
        <div className="row between">
          <h2>Dashboard {course ? `— ${course.name}` : ""}</h2>
          {managed.length > 1 && (
            <select value={courseId ?? ""} onChange={(e) => setCourse(e.target.value)} aria-label="Môn phụ trách">
              {managed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {courses !== null && managed.length === 0 && <div className="banner banner-info">Bạn chưa phụ trách môn nào.</div>}
        {err && <div className="banner banner-error">{err}</div>}
        <div className="chips">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
            <button key={t} type="button" className={`chip${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {TABS[t]}
            </button>
          ))}
        </div>

        {tab === "overview" && overview && (
          <>
            <label className="small">
              Khoảng thời gian{" "}
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>7 ngày</option>
                <option value={30}>30 ngày</option>
                <option value={90}>90 ngày</option>
              </select>
            </label>
            <div className="tiles">
              <Tile label="Câu hỏi" value={u?.total_queries} />
              <Tile label="Trả lời có nguồn" value={u?.by_status.answered ?? 0} />
              <Tile label="Thiếu căn cứ" value={overview.source_gaps.insufficient_evidence} />
              <Tile label="Từ chối liêm chính" value={u?.by_status.integrity_redirect ?? 0} />
              <Tile label="Lỗi kỹ thuật" value={u?.by_status.error ?? 0} />
              <Tile label="Latency p95" value={u?.latency_p95_ms != null ? `${(u.latency_p95_ms / 1000).toFixed(1)} s` : null} />
              <Tile label="Chờ duyệt" value={overview.review_queue} />
              <Tile label="Accuracy eval" value={null} note="chưa có dữ liệu" />
            </div>
            <h3>Tài liệu theo trạng thái</h3>
            <ul className="inline-list">
              {Object.entries(overview.documents_by_state).map(([s, n]) => (
                <li key={s}>
                  {STATE_LABEL[s] ?? s}: <strong>{n}</strong>
                </li>
              ))}
              {Object.keys(overview.documents_by_state).length === 0 && <li className="muted">Chưa có tài liệu.</li>}
            </ul>
            <h3>Phản hồi</h3>
            <ul className="inline-list">
              {["Open", "InProgress", "Resolved"].map((s) => (
                <li key={s}>
                  {s}: <strong>{overview.feedback_by_status[s] ?? 0}</strong>
                </li>
              ))}
            </ul>
            <p className="muted small">{overview.source_gaps.note}</p>
          </>
        )}

        {tab === "feedback" && (
          <>
            <label className="small">
              Trạng thái{" "}
              <select value={fbFilter} onChange={(e) => setFbFilter(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="Open">Open</option>
                <option value="InProgress">InProgress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </label>
            {feedback.length === 0 && <p className="muted">Chưa có phản hồi.</p>}
            {feedback.map((f) => (
              <div key={f.id} className="card feedback-item">
                <div className="row between">
                  <strong>{FEEDBACK_LABEL[f.type] ?? f.type}</strong>
                  <span className="status-badge">{f.status}</span>
                </div>
                {f.note && <p>{f.note}</p>}
                {f.shared ? (
                  <details>
                    <summary>Nội dung được chia sẻ</summary>
                    <p>
                      <strong>Câu hỏi:</strong> {f.shared.question}
                    </p>
                    <p>
                      <strong>Trả lời:</strong> {f.shared.answer}
                    </p>
                  </details>
                ) : (
                  <p className="muted small">Người dùng không chia sẻ nội dung hội thoại.</p>
                )}
                {f.resolution_note && <p className="small">Xử lý: {f.resolution_note}</p>}
                <div className="row">
                  <span className="muted small">{f.created_at.slice(0, 16).replace("T", " ")}</span>
                  {f.status !== "InProgress" && (
                    <button type="button" className="btn-secondary" onClick={() => void updateFeedback(f.id, "InProgress")}>
                      {f.status === "Resolved" ? "Mở lại" : "Nhận xử lý"}
                    </button>
                  )}
                  {f.status !== "Resolved" && (
                    <button type="button" onClick={() => void updateFeedback(f.id, "Resolved")}>
                      Đã xử lý
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "history" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="small">{h.created_at?.slice(0, 16).replace("T", " ")}</td>
                    <td>{h.actor}</td>
                    <td>{h.action}</td>
                    <td className="small">
                      {h.object_type} {h.object_id}
                    </td>
                    <td className="small">{h.reason}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Chưa có lịch sử.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Tile({ label, value, note }: { label: string; value: number | string | null | undefined; note?: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value ?? "—"}</div>
      <div className="tile-label">{label}</div>
      {(value === null || value === undefined) && <div className="muted small">{note ?? "chưa có dữ liệu"}</div>}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}
