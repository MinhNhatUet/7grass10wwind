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
      <main className="mx-auto max-w-6xl p-6 lg:p-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Duyệt tài liệu</h2>
            {course && <p className="text-muted-foreground mt-1">{course.name}</p>}
          </div>
          {managed.length > 1 && (
            <select 
              value={courseId ?? ""} 
              onChange={(e) => setCourse(e.target.value)} 
              aria-label="Môn duyệt"
              className="bg-secondary/50 border-0 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary hover:bg-secondary cursor-pointer"
            >
              {managed.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </header>

        {courses !== null && managed.length === 0 && (
          <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-xl text-sm">{MSG.notAssignedReview}</div>
        )}
        {msg && (
          <div className={`px-4 py-3 rounded-xl text-sm border ${msg.kind === "error" ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-primary/10 border-primary/20 text-primary"}`}>
            {msg.text}
          </div>
        )}

        <div className="flex items-center gap-2 bg-secondary/30 p-1.5 rounded-xl border border-border w-fit">
          <button 
            type="button" 
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "queue" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`} 
            onClick={() => setTab("queue")}
          >
            Hàng đợi duyệt
          </button>
          <button 
            type="button" 
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "published" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`} 
            onClick={() => setTab("published")}
          >
            Đang phát hành (thu hồi)
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Tài liệu</th>
                  <th className="px-5 py-3 font-medium">Bản</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                  <th className="px-5 py-3 font-medium">Cập nhật</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      {tab === "queue" ? "Không có tài liệu chờ duyệt." : "Chưa có tài liệu phát hành."}
                    </td>
                  </tr>
                )}
                {items.map((v) => (
                  <tr key={v.version_id} className={`transition-colors hover:bg-secondary/30 ${selected === v.version_id ? "bg-secondary/50" : ""}`}>
                    <td className="px-5 py-3 font-medium">{v.title}</td>
                    <td className="px-5 py-3">
                      {v.version_label} <span className="text-muted-foreground text-xs ml-1">r{v.revision}</span>
                    </td>
                    <td className="px-5 py-3">
                      <StateBadge state={v.state} />
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{v.updated_at?.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-5 py-3 text-right">
                      <button 
                        type="button" 
                        className="bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors text-xs font-medium cursor-pointer" 
                        onClick={() => setSelected(v.version_id)}
                      >
                        Mở
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mt-8 space-y-5">
            <VersionPreview versionId={selected} onLoaded={onLoaded} />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Lý do {tab === "queue" ? "(bắt buộc khi từ chối)" : "thu hồi (bắt buộc)"}
              </label>
              <textarea 
                rows={3} 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                className="w-full bg-secondary/50 border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary resize-y"
                placeholder="Nhập lý do..."
              />
            </div>
            {tab === "queue" && info && !info.can_decide && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-xl text-sm">
                {info.version.uploader_id === profile?.user.id
                  ? "Người tải lên không được tự duyệt tài liệu của mình."
                  : MSG.notAssignedReview}
              </div>
            )}
            <div className="flex items-center gap-3 pt-2">
              {tab === "queue" ? (
                <>
                  <button 
                    type="button" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-5 py-2.5 rounded-xl border-0 cursor-pointer disabled:opacity-50 transition-colors" 
                    disabled={!info?.can_decide} 
                    onClick={() => void decide("approve")}
                  >
                    Duyệt (revision {info?.version.revision})
                  </button>
                  <button 
                    type="button" 
                    className="bg-destructive/10 hover:bg-destructive/20 text-destructive font-medium px-5 py-2.5 rounded-xl border border-destructive/20 cursor-pointer disabled:opacity-50 transition-colors" 
                    disabled={!info?.can_decide} 
                    onClick={() => void decide("reject")}
                  >
                    Từ chối
                  </button>
                </>
              ) : (
                <button 
                  type="button" 
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium px-5 py-2.5 rounded-xl border-0 cursor-pointer transition-colors" 
                  onClick={() => void withdraw()}
                >
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
