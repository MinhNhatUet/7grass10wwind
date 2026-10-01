"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useManagedCourse } from "@/components/useManagedCourse";
import { ApiError, api, json, type CourseItem } from "@/lib/api";
import { FEEDBACK_LABEL, MSG, STATE_LABEL, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";
import gsap from "gsap";

// UI-09 — Dashboard Giảng viên (FR-12): chỉ môn phụ trách; không mở hội thoại riêng; số chưa đo ghi "chưa có dữ liệu".

import { 
  MessageSquare, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  AlertOctagon, 
  Clock, 
  Inbox, 
  Sparkles, 
  BarChart3, 
  History as HistoryIcon,
  MessageCircleQuestion,
  ChevronDown
} from "lucide-react";

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

const TABS = { 
  overview: { label: "Báo cáo thống kê", icon: BarChart3 }, 
  feedback: { label: "Ý kiến phản hồi", icon: MessageCircleQuestion }, 
  history: { label: "Nhật ký hoạt động", icon: HistoryIcon } 
} as const;

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "overview" && overview) {
      gsap.fromTo(
        ".tile",
        { opacity: 0, scale: 0.96, y: 12 },
        { opacity: 1, scale: 1, y: 0, duration: 0.45, stagger: 0.04, ease: "power2.out" }
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

  const course = managed.find((c: CourseItem) => c.id === courseId);
  const u = overview?.usage;

  return (
    <AppShell profile={profile} courses={courses} courseId={courseId} onSignOut={signOut}>
      <main className="mx-auto max-w-6xl p-6 lg:p-10 space-y-8">
        
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20 mb-2">
              <BarChart3 size={13} />
              <span>Phân tích & Giám sát học vụ</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Thống kê Giảng viên</h1>
            {course && <p className="text-muted-foreground text-sm mt-1">Môn phụ trách: <strong className="text-foreground">{course.name}</strong></p>}
          </div>

          {managed.length > 1 && (
            <div className="relative">
              <select 
                value={courseId ?? ""} 
                onChange={(e) => setCourse(e.target.value)} 
                aria-label="Chọn môn phụ trách"
                className="appearance-none glass-panel rounded-xl px-4 py-2.5 pr-10 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20 hover:bg-secondary cursor-pointer transition-colors"
              >
                {managed.map((c: CourseItem) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <ChevronDown size={15} />
              </div>
            </div>
          )}
        </header>

        {courses !== null && managed.length === 0 && (
          <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-xl text-sm font-medium">
            Bạn hiện chưa phụ trách môn học nào.
          </div>
        )}
        {err && (
          <div className="bg-destructive/10 border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm border font-medium">
            {err}
          </div>
        )}

        {/* TABS */}
        <div className="flex items-center gap-1.5 glass-panel p-1 rounded-2xl w-fit" role="tablist">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => {
            const TabIcon = TABS[t].icon;
            const isCurrent = tab === t;
            return (
              <button 
                key={t} 
                type="button" 
                role="tab"
                aria-selected={isCurrent}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  isCurrent 
                    ? "bg-background shadow-xs text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                onClick={() => setTab(t)}
              >
                <TabIcon size={15} className={isCurrent ? "text-primary" : ""} />
                <span>{TABS[t].label}</span>
              </button>
            );
          })}
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && overview && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Số liệu tổng quan</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Khoảng thời gian:</span>
                <select 
                  value={days} 
                  onChange={(e) => setDays(Number(e.target.value))}
                  aria-label="Khoảng thời gian thống kê"
                  className="glass-panel rounded-xl px-3 py-1.5 text-xs font-semibold outline-none cursor-pointer hover:bg-secondary transition-colors"
                >
                  <option value={7}>7 ngày qua</option>
                  <option value={30}>30 ngày qua</option>
                  <option value={90}>90 ngày qua</option>
                </select>
              </div>
            </div>
            
            {/* TILES GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <Tile 
                label="Tổng số câu hỏi" 
                value={u?.total_queries} 
                icon={MessageSquare} 
                colorClass="text-primary bg-primary/10 border-primary/20" 
              />
              <Tile 
                label="Trả lời có nguồn" 
                value={u?.by_status.answered ?? 0} 
                icon={CheckCircle2} 
                colorClass="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" 
              />
              <Tile 
                label="Thiếu tài liệu căn cứ" 
                value={overview.source_gaps.insufficient_evidence} 
                icon={AlertTriangle} 
                colorClass="text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" 
              />
              <Tile 
                label="Từ chối vì liêm chính" 
                value={u?.by_status.integrity_redirect ?? 0} 
                icon={ShieldAlert} 
                colorClass="text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20" 
              />
              <Tile 
                label="Lỗi xử lý kỹ thuật" 
                value={u?.by_status.error ?? 0} 
                icon={AlertOctagon} 
                colorClass="text-destructive bg-destructive/10 border-destructive/20" 
              />
              <Tile 
                label="Độ trễ phản hồi (p95)" 
                value={u?.latency_p95_ms != null ? `${(u.latency_p95_ms / 1000).toFixed(1)} s` : null} 
                icon={Clock} 
                colorClass="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20" 
              />
              <Tile 
                label="Tài liệu chờ duyệt" 
                value={overview.review_queue} 
                icon={Inbox} 
                colorClass="text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20" 
              />
              <Tile 
                label="Độ chuẩn xác (Eval)" 
                value={null} 
                note="chưa có dữ liệu" 
                icon={Sparkles} 
                colorClass="text-muted-foreground bg-secondary/80 border-border" 
              />
            </div>

            {/* BREAKDOWN SECTIONS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="glass-card rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                  <h3 className="font-bold text-sm text-foreground">Tài liệu theo trạng thái</h3>
                  <span className="text-xs text-muted-foreground font-medium">Hệ thống LMS</span>
                </div>
                <ul className="space-y-3 list-none p-0 m-0">
                  {Object.entries(overview.documents_by_state).map(([s, n]) => (
                    <li key={s} className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">{STATE_LABEL[s] ?? s}</span>
                      <strong className="bg-secondary text-foreground px-2.5 py-1 rounded-lg text-xs font-semibold border border-border/60">
                        {n}
                      </strong>
                    </li>
                  ))}
                  {Object.keys(overview.documents_by_state).length === 0 && (
                    <li className="text-muted-foreground text-xs py-4 text-center">Chưa có tài liệu nào trong môn học này.</li>
                  )}
                </ul>
              </div>

              <div className="glass-card rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                  <h3 className="font-bold text-sm text-foreground">Phản hồi từ người dùng</h3>
                  <span className="text-xs text-muted-foreground font-medium">Trạng thái xử lý</span>
                </div>
                <ul className="space-y-3 list-none p-0 m-0">
                  {[
                    { key: "Open", label: "Chờ xử lý (Open)", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                    { key: "InProgress", label: "Đang xử lý (In Progress)", color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
                    { key: "Resolved", label: "Đã hoàn thành (Resolved)", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                  ].map(({ key, label, color }) => (
                    <li key={key} className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">{label}</span>
                      <strong className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${color}`}>
                        {overview.feedback_by_status[key] ?? 0}
                      </strong>
                    </li>
                  ))}
                </ul>
                {overview.source_gaps.note && (
                  <p className="text-xs text-muted-foreground/80 mt-4 pt-3 border-t border-border/40">
                    {overview.source_gaps.note}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FEEDBACK TAB */}
        {tab === "feedback" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lọc trạng thái:</span>
                <select 
                  value={fbFilter} 
                  onChange={(e) => setFbFilter(e.target.value)}
                  aria-label="Lọc phản hồi theo trạng thái"
                  className="glass-panel rounded-xl px-3.5 py-1.5 text-xs font-semibold outline-none cursor-pointer hover:bg-secondary transition-colors"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="Open">Chờ xử lý (Open)</option>
                  <option value="InProgress">Đang xử lý (InProgress)</option>
                  <option value="Resolved">Đã giải quyết (Resolved)</option>
                </select>
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                Tìm thấy {feedback.length} phản hồi
              </span>
            </div>
            
            {feedback.length === 0 && (
              <div className="text-center py-16 glass-card rounded-3xl border border-border/60 border-dashed">
                <p className="text-muted-foreground text-sm font-medium">Hiện chưa có phản hồi nào phù hợp.</p>
              </div>
            )}

            <div className="grid gap-4">
              {feedback.map((f) => {
                const isResolved = f.status === "Resolved";
                const isInProgress = f.status === "InProgress";
                const badgeColor = isResolved 
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : isInProgress
                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";

                return (
                  <div key={f.id} className="glass-card rounded-2xl p-5 shadow-xs space-y-4 hover:border-primary/30 transition-all">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-foreground">
                          {FEEDBACK_LABEL[f.type as keyof typeof FEEDBACK_LABEL] ?? f.type}
                        </strong>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>
                        {f.status}
                      </span>
                    </div>

                    {f.note && <p className="text-sm text-foreground/90 leading-relaxed">{f.note}</p>}
                    
                    {f.shared ? (
                      <details className="text-xs bg-secondary/40 border border-border/50 rounded-xl p-3.5">
                        <summary className="font-semibold cursor-pointer mb-2 text-foreground">Trích đoạn hội thoại đính kèm</summary>
                        <div className="space-y-2 text-muted-foreground pt-1 border-t border-border/30">
                          <p><strong className="text-foreground">Câu hỏi:</strong> {f.shared.question}</p>
                          <p><strong className="text-foreground">Trả lời AI:</strong> {f.shared.answer}</p>
                        </div>
                      </details>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70 italic">Người dùng không chia sẻ nội dung chi tiết của hội thoại.</p>
                    )}

                    {f.resolution_note && (
                      <div className="text-xs text-primary bg-primary/10 border border-primary/20 p-3 rounded-xl">
                        <strong>Ghi chú xử lý:</strong> {f.resolution_note}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {f.created_at.slice(0, 16).replace("T", " ")}
                      </span>
                      <div className="flex items-center gap-2">
                        {f.status !== "InProgress" && (
                          <button 
                            type="button" 
                            className="text-xs font-semibold bg-secondary hover:bg-secondary/80 px-3.5 py-1.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer border border-border/70" 
                            onClick={() => void updateFeedback(f.id, "InProgress")}
                          >
                            {f.status === "Resolved" ? "Mở lại" : "Nhận xử lý"}
                          </button>
                        )}
                        {f.status !== "Resolved" && (
                          <button 
                            type="button" 
                            className="text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-1.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer shadow-xs" 
                            onClick={() => void updateFeedback(f.id, "Resolved")}
                          >
                            Đã xử lý xong
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <div className="glass-card rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-secondary/60 border-b border-border text-muted-foreground uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">Thời gian</th>
                    <th className="px-5 py-3.5 font-bold">Người thực hiện</th>
                    <th className="px-5 py-3.5 font-bold">Hành động</th>
                    <th className="px-5 py-3.5 font-bold">Đối tượng tác động</th>
                    <th className="px-5 py-3.5 font-bold">Lý do / Diễn giải</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground font-medium">
                        Chưa có lịch sử hoạt động nào được ghi nhận.
                      </td>
                    </tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={i} className="transition-colors hover:bg-secondary/40">
                      <td className="px-5 py-3.5 text-muted-foreground font-mono">{h.created_at?.slice(0, 16).replace("T", " ")}</td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">{h.actor}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-secondary/80 text-foreground px-2 py-0.5 rounded-md border border-border/60 font-medium">
                          {h.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded mr-1">
                          {h.object_type}
                        </span>
                        <span className="text-muted-foreground font-mono text-[11px]">{h.object_id.slice(0, 8)}…</span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground truncate max-w-[240px]" title={h.reason || ""}>
                        {h.reason || "—"}
                      </td>
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

interface TileProps {
  label: string;
  value: number | string | null | undefined;
  note?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
}

function Tile({ label, value, note, icon: IconComponent, colorClass }: TileProps) {
  return (
    <div className="tile glass-card rounded-2xl p-5 shadow-xs transition-all hover:shadow-md hover:border-primary/40 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-semibold leading-tight line-clamp-1">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${colorClass}`}>
          <IconComponent size={16} />
        </div>
      </div>
      <div>
        <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
          {value ?? "—"}
        </div>
        {(value === null || value === undefined) && (
          <div className="text-[11px] text-muted-foreground/60 mt-1">{note ?? "chưa có dữ liệu"}</div>
        )}
      </div>
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
