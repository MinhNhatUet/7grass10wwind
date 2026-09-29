"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useManagedCourse } from "@/components/useManagedCourse";
import { ApiError, api, json } from "@/lib/api";
import { FEEDBACK_LABEL, MSG, STATE_LABEL, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";
import gsap from "gsap";

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

  useEffect(() => {
    if (tab === "overview" && overview) {
      gsap.fromTo(
        ".tile",
        { opacity: 0, scale: 0.95, y: 15 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "back.out(1.5)" }
      );
    }
  }, [tab, overview]);

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
      <main className="mx-auto max-w-6xl p-6 lg:p-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            {course && <p className="text-muted-foreground mt-1">{course.name}</p>}
          </div>
          {managed.length > 1 && (
            <select 
              value={courseId ?? ""} 
              onChange={(e) => setCourse(e.target.value)} 
              aria-label="Môn phụ trách"
              className="bg-secondary/50 border-0 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary hover:bg-secondary cursor-pointer"
            >
              {managed.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </header>

        {courses !== null && managed.length === 0 && (
          <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-xl text-sm">Bạn chưa phụ trách môn nào.</div>
        )}
        {err && (
          <div className="bg-destructive/10 border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm border">{err}</div>
        )}

        <div className="flex items-center gap-2 bg-secondary/30 p-1.5 rounded-xl border border-border w-fit">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
            <button 
              key={t} 
              type="button" 
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}
              onClick={() => setTab(t)}
            >
              {TABS[t]}
            </button>
          ))}
        </div>

        {tab === "overview" && overview && (
          <div className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Thống kê chung</h3>
              <select 
                value={days} 
                onChange={(e) => setDays(Number(e.target.value))}
                className="bg-secondary/50 border-0 rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer hover:bg-secondary"
              >
                <option value={7}>7 ngày</option>
                <option value={30}>30 ngày</option>
                <option value={90}>90 ngày</option>
              </select>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Tile label="Câu hỏi" value={u?.total_queries} />
              <Tile label="Trả lời có nguồn" value={u?.by_status.answered ?? 0} />
              <Tile label="Thiếu căn cứ" value={overview.source_gaps.insufficient_evidence} />
              <Tile label="Từ chối liêm chính" value={u?.by_status.integrity_redirect ?? 0} />
              <Tile label="Lỗi kỹ thuật" value={u?.by_status.error ?? 0} />
              <Tile label="Latency p95" value={u?.latency_p95_ms != null ? `${(u.latency_p95_ms / 1000).toFixed(1)} s` : null} />
              <Tile label="Chờ duyệt" value={overview.review_queue} />
              <Tile label="Accuracy eval" value={null} note="chưa có dữ liệu" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <h4 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">Tài liệu theo trạng thái</h4>
                <ul className="space-y-3 list-none p-0 m-0">
                  {Object.entries(overview.documents_by_state).map(([s, n]) => (
                    <li key={s} className="flex justify-between items-center text-sm">
                      <span>{STATE_LABEL[s] ?? s}</span>
                      <strong className="bg-secondary px-2 py-1 rounded-md">{n}</strong>
                    </li>
                  ))}
                  {Object.keys(overview.documents_by_state).length === 0 && <li className="text-muted-foreground text-sm">Chưa có tài liệu.</li>}
                </ul>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <h4 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">Phản hồi từ người dùng</h4>
                <ul className="space-y-3 list-none p-0 m-0">
                  {["Open", "InProgress", "Resolved"].map((s) => (
                    <li key={s} className="flex justify-between items-center text-sm">
                      <span>{s}</span>
                      <strong className="bg-secondary px-2 py-1 rounded-md">{overview.feedback_by_status[s] ?? 0}</strong>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/50">{overview.source_gaps.note}</p>
              </div>
            </div>
          </div>
        )}

        {tab === "feedback" && (
          <div className="space-y-4 mt-6">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Trạng thái:</span>
              <select 
                value={fbFilter} 
                onChange={(e) => setFbFilter(e.target.value)}
                className="bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer hover:bg-secondary"
              >
                <option value="">Tất cả</option>
                <option value="Open">Open</option>
                <option value="InProgress">InProgress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
            
            {feedback.length === 0 && <p className="text-muted-foreground text-center py-8">Chưa có phản hồi.</p>}
            <div className="grid gap-4">
              {feedback.map((f) => (
                <div key={f.id} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <strong className="text-sm">{FEEDBACK_LABEL[f.type as keyof typeof FEEDBACK_LABEL] ?? f.type}</strong>
                    <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-xs font-medium border border-border">
                      {f.status}
                    </span>
                  </div>
                  {f.note && <p className="text-sm text-foreground">{f.note}</p>}
                  {f.shared ? (
                    <details className="text-sm bg-secondary/30 rounded-lg p-3">
                      <summary className="font-medium cursor-pointer mb-2">Nội dung được chia sẻ</summary>
                      <div className="space-y-2 text-muted-foreground">
                        <p><strong>Câu hỏi:</strong> {f.shared.question}</p>
                        <p><strong>Trả lời:</strong> {f.shared.answer}</p>
                      </div>
                    </details>
                  ) : (
                    <p className="text-xs text-muted-foreground">Người dùng không chia sẻ nội dung hội thoại.</p>
                  )}
                  {f.resolution_note && <p className="text-sm text-primary bg-primary/5 p-2 rounded-lg">Xử lý: {f.resolution_note}</p>}
                  
                  <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground flex-1">{f.created_at.slice(0, 16).replace("T", " ")}</span>
                    {f.status !== "InProgress" && (
                      <button 
                        type="button" 
                        className="text-xs font-medium bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-border" 
                        onClick={() => void updateFeedback(f.id, "InProgress")}
                      >
                        {f.status === "Resolved" ? "Mở lại" : "Nhận xử lý"}
                      </button>
                    )}
                    {f.status !== "Resolved" && (
                      <button 
                        type="button" 
                        className="text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-lg transition-colors cursor-pointer" 
                        onClick={() => void updateFeedback(f.id, "Resolved")}
                      >
                        Đã xử lý
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm mt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Thời gian</th>
                    <th className="px-5 py-3 font-medium">Người thực hiện</th>
                    <th className="px-5 py-3 font-medium">Hành động</th>
                    <th className="px-5 py-3 font-medium">Đối tượng</th>
                    <th className="px-5 py-3 font-medium">Lý do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Chưa có lịch sử.</td>
                    </tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={i} className="transition-colors hover:bg-secondary/30">
                      <td className="px-5 py-3 text-muted-foreground text-xs">{h.created_at?.slice(0, 16).replace("T", " ")}</td>
                      <td className="px-5 py-3 font-medium">{h.actor}</td>
                      <td className="px-5 py-3 text-xs">{h.action}</td>
                      <td className="px-5 py-3">
                        <span className="bg-secondary px-2 py-0.5 rounded-md text-xs border border-border font-mono">{h.object_type}</span>
                        <span className="text-muted-foreground text-xs ml-2">{h.object_id.slice(0, 8)}…</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs truncate max-w-[200px]" title={h.reason || ""}>{h.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Tile({ label, value, note }: { label: string; value: number | string | null | undefined; note?: string }) {
  return (
    <div className="tile bg-card border border-border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/20">
      <div className="text-3xl font-bold text-foreground mb-1">{value ?? "—"}</div>
      <div className="text-sm text-muted-foreground font-medium">{label}</div>
      {(value === null || value === undefined) && <div className="text-xs text-muted-foreground/60 mt-2">{note ?? "chưa có dữ liệu"}</div>}
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
