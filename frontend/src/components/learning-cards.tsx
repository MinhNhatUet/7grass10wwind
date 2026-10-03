"use client";

// Thẻ học trong chat TV4 (gộp từ frontend cũ — D-30, D-37): quiz/chẩn đoán, lộ trình (+ Google Calendar, ôn tập theo
// ngày), flashcard, điền khuyết, cấp cứu sát giờ thi, kết quả Knowledge Hub, gợi ý bắt đầu nhanh.
// Nội dung & nguồn do backend tạo và kiểm tra; UI chỉ hiển thị + tương tác.

import { useState } from "react";
import { ApiError, type ChatMessage, type HubResult, type ItemEvidence, type PlanSession, api, downloadFile, json } from "@/lib/api";
import { LEVEL_LABEL, MSG, errorMessage } from "@/lib/messages";
import { M } from "@/components/math-text";
import { CitationBadge } from "@/components/chat/CitationBadge";
import type { Source } from "@/types/chat";

type Meta = ChatMessage["metadata"];
const card = "mt-3.5 rounded-2xl border border-border/80 bg-card/85 backdrop-blur-xl p-4.5 text-[14px] shadow-ambient transition-all";
const btn = "rounded-xl px-4 py-2 text-[13px] font-semibold cursor-pointer border-0 bg-primary text-primary-foreground shadow-xs hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all";
const btn2 = "rounded-xl px-3.5 py-1.5 text-[13px] font-medium cursor-pointer border border-border/80 bg-secondary/60 hover:bg-secondary text-foreground active:scale-95 disabled:opacity-40 transition-all";
const muted = "text-muted-foreground";

/** Khoá sessionStorage của yêu cầu học tập chờ trang chat gửi (D-45). */
export const PENDING_SEND = "pendingLearningSend";

/** Loại bài KHÔNG hiện nguồn khi vừa tạo (người học tự làm trước); dẫn chứng chỉ hiện sau khi trả lời/lật/kiểm tra. */
export const HIDE_SOURCE_KINDS = ["quiz", "diagnose", "mcq", "flashcards", "cloze", "plan"];
/** Bỏ nhãn [n] / [1, 3] khỏi văn bản hiển thị. */
export const noCite = (t: string) => t.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/,(\s*)(?=[.;,)]|$)/g, "");

/** Nguồn của tin nhắn + mở trang nguồn ở khung bên phải. */
type CiteCtx = { sources: Source[]; onSource: (s: Source) => void };

/** Badge [n] như trong chat (D-55): rê chuột hiện đoạn trích + trang; bấm mở trang nguồn. D-57: ưu tiên đoạn trích
 *  và trang riêng của mục (ev) — mục cùng nguồn không lặp một đoạn chung, không rơi về trang đầu chunk. */
function Cites({ ns, ev, cx }: { ns: number[]; ev?: ItemEvidence; cx: CiteCtx }) {
  return (
    <>
      {ns.map((n) => {
        const s = cx.sources.find((x) => String(x.id) === String(n));
        const own = ev?.[String(n)];
        return s ? <CitationBadge key={n} source={own ? { ...s, content: own.quote, page: own.page, pageEnd: own.page_end ?? null } : s} onClick={cx.onSource} /> : null;
      })}
    </>
  );
}

/** Dẫn chứng dưới mục (hiện sau khi lật / trả lời / kiểm tra). */
function Evidence(props: { ns: number[]; ev?: ItemEvidence; cx: CiteCtx }) {
  if (!props.ns.some((n) => props.cx.sources.some((x) => String(x.id) === String(n)))) return null;
  return <div className="mt-2 flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground">Nguồn: <Cites {...props} /></div>;
}

function useCall(onChanged: () => void) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function call(method: "POST" | "PATCH", path: string, body?: unknown) {
    setErr(null);
    setBusy(true);
    try {
      await api(path, { method, body: body === undefined ? undefined : json(body) });
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    } finally {
      setBusy(false);
    }
  }
  return { err, busy, call, setErr };
}

const ErrLine = ({ err }: { err: string | null }) =>
  err ? <p className="mt-2 rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-red-700 dark:text-red-200">{err}</p> : null;

/* ---------- Tự kiểm tra / chẩn đoán ---------- */
function QuizCard({ meta, messageId, onChanged, cx }: { meta: Meta; messageId: string; onChanged: () => void; cx: CiteCtx }) {
  const qs = meta.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>(meta.answers ?? {});
  const { err, busy, call } = useCall(onChanged);
  const done = qs.filter((q) => (answers[q.id] ?? "").trim()).length;
  return (
    <div className={card}>
      {qs.map((q, i) => (
        <div key={q.id} className="mb-3">
          <p className={`text-[12px] ${muted}`}>Câu {i + 1}/{qs.length} · {q.topic}</p>
          <p className="my-1 font-medium"><M>{q.question}</M></p>
          <textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} rows={2}
            aria-label={`Câu trả lời câu ${i + 1}`}
            className="w-full rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 outline-none" />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[12px] ${muted}`}>Đã làm {done}/{qs.length}</span>
        <button type="button" className={btn2} disabled={busy} onClick={() => void call("POST", `/learning/quizzes/${messageId}/answers`, { answers, submit: false })}>Lưu tạm</button>
        <button type="button" className={btn} disabled={busy || done === 0} onClick={() => void call("POST", `/learning/quizzes/${messageId}/answers`, { answers, submit: true })}>
          {busy ? "Đang đánh giá…" : "Gửi để đánh giá"}
        </button>
      </div>
      <ErrLine err={err} />
      {meta.assessment && (
        <div className="mt-3 border-t border-black/10 dark:border-white/10 pt-3">
          <p className="font-semibold">{meta.kind === "diagnose" ? "Bạn nên bắt đầu từ đâu" : "Mức hiểu theo chủ đề"} <span className={`font-normal ${muted}`}>(gợi ý học tập, không phải điểm)</span></p>
          <ul className="mt-1 space-y-2">
            {meta.assessment.topics.map((t, i) => (
              <li key={i}>
                <strong>{t.topic}</strong>: {LEVEL_LABEL[t.level] ?? t.level}{t.rationale && <> — <M>{t.rationale}</M></>}
                {t.review && <div className={`text-[12px] ${muted}`}>Xem lại: {t.review}</div>}
                {!!t.review_citations?.length && <div className="text-[12px]">Đọc đoạn này trước rồi quay lại: <Cites ns={t.review_citations} cx={cx} /></div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Lộ trình: xác nhận, trạng thái, ôn tập theo ngày, Google Calendar ---------- */
const SESSION_LABEL: Record<string, string> = { not_started: "Chưa học", in_progress: "Đang học", done: "Đã xong" };

function gcalLink(title: string, details: string, begin: Date, minutes: number): string {
  const f = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T` +
    `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const end = new Date(begin.getTime() + minutes * 60_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, details, dates: `${f(begin)}/${f(end)}`, ctz: "Asia/Ho_Chi_Minh" });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Cùng quy tắc với file .ics phía server: ngày 1 = ngày bắt đầu, buổi cùng ngày nối tiếp. */
function sessionStarts(sessions: PlanSession[], start: string, at: string, dates?: string[] | null): Map<string, Date> {
  const out = new Map<string, Date>();
  const used = new Map<number, number>();
  const [h, mi] = at.split(":").map(Number);
  for (const s of sessions.slice().sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))) {
    const off = used.get(s.day) ?? 0;
    const iso = dates?.[s.day - 1]; // D-46: ngày người học chọn; không có thì ngày bắt đầu + (k − 1)
    const [y, mo, d] = (iso ?? start).split("-").map(Number);
    out.set(s.id, new Date(y, mo - 1, iso ? d : d + s.day - 1, h, mi + off));
    used.set(s.day, off + s.minutes);
  }
  return out;
}

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "T4 01/10" khi lộ trình có ngày cụ thể (D-46), không thì "Ngày k". */
export function dayLabel(dates: string[] | null | undefined, day: number): string {
  const iso = dates?.[day - 1];
  if (!iso) return `Ngày ${day}`;
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function tomorrow(): string {
  const t = new Date(Date.now() + 86_400_000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/* ---------- Sửa lộ trình (D-43): mục tiêu, thêm/bớt/sửa buổi ---------- */
type SessionDraft = { id: string | null; day: number; title: string; objective: string; activity: string; self_check: string; minutes: number };
const inp = "w-full rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-2 py-1 text-[13px] outline-none";

function PlanEditor({ plan, onSaved, onCancel }: { plan: NonNullable<Meta["plan"]>; onSaved: () => void; onCancel: () => void }) {
  const [goal, setGoal] = useState(plan.goal);
  const [rows, setRows] = useState<SessionDraft[]>(() =>
    plan.sessions.slice().sort((a, b) => a.day - b.day).map((s) => ({
      id: s.id, day: s.day, title: noCite(s.title), objective: noCite(s.objective), activity: noCite(s.activity), self_check: noCite(s.self_check), minutes: s.minutes,
    })));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: number, patch: Partial<SessionDraft>) => setRows(rows.map((r, i) => (i === k ? { ...r, ...patch } : r)));
  const total = rows.reduce((n, r) => n + (Number(r.minutes) || 0), 0);

  async function save() {
    if (!goal.trim() || rows.length === 0 || rows.some((r) => !r.title.trim())) return setErr("Cần mục tiêu, ít nhất một buổi và tên cho mỗi buổi.");
    setErr(null);
    setBusy(true);
    try {
      await api(`/learning/plans/${plan.id}`, { method: "PUT", body: json({ goal: goal.trim(), sessions: rows.map((r) => ({ ...r, title: r.title.trim() })) }) });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail || errorMessage(e.code) : MSG.serviceError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <label className="block text-[13px] font-semibold">Mục tiêu
        <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={2000} className={`${inp} mt-1`} />
      </label>
      <ol className="mt-3 space-y-3">
        {rows.map((r, k) => (
          <li key={r.id ?? `new-${k}`} className="rounded-xl border border-black/10 dark:border-white/10 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {plan.dates?.length ? (
                <label>Ngày <select value={r.day} onChange={(e) => set(k, { day: Number(e.target.value) })} className={`${inp} !w-auto`}>
                  {plan.dates.map((_, i) => <option key={i} value={i + 1}>{dayLabel(plan.dates, i + 1)}</option>)}
                </select></label>
              ) : (
                <label>Ngày <input type="number" min={1} max={60} value={r.day} onChange={(e) => set(k, { day: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} className={`${inp} !w-16`} /></label>
              )}
              <label>Phút <input type="number" min={5} max={600} step={5} value={r.minutes} onChange={(e) => set(k, { minutes: Math.min(600, Math.max(5, Number(e.target.value) || 5)) })} className={`${inp} !w-20`} /></label>
              <span className="flex-1" />
              <button type="button" className={btn2} onClick={() => setRows(rows.filter((_, i) => i !== k))} aria-label={`Xoá buổi ${k + 1}`}>Xoá buổi</button>
            </div>
            <input value={r.title} onChange={(e) => set(k, { title: e.target.value })} maxLength={200} placeholder="Tên buổi học" aria-label="Tên buổi học" className={inp} />
            <textarea value={r.objective} onChange={(e) => set(k, { objective: e.target.value })} maxLength={1000} rows={2} placeholder="Mục tiêu buổi học" aria-label="Mục tiêu buổi học" className={inp} />
            <textarea value={r.activity} onChange={(e) => set(k, { activity: e.target.value })} maxLength={1000} rows={2} placeholder="Hoạt động" aria-label="Hoạt động" className={inp} />
            <input value={r.self_check} onChange={(e) => set(k, { self_check: e.target.value })} maxLength={1000} placeholder="Tự kiểm tra" aria-label="Tự kiểm tra" className={inp} />
          </li>
        ))}
      </ol>
      <button type="button" className={`${btn2} mt-3`} disabled={rows.length >= 60}
        onClick={() => setRows([...rows, { id: null, day: Math.min((rows.at(-1)?.day ?? 0) + 1, plan.dates?.length || 60), title: "", objective: "", activity: "", self_check: "", minutes: plan.minutes_per_day || 45 }])}>
        + Thêm buổi
      </button>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[12px] ${muted}`}>{rows.length} buổi · tổng {total} phút. Buổi mới chưa có nguồn từ tài liệu.</span>
        <div className="flex gap-2">
          <button type="button" className={btn2} onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="button" className={btn} onClick={() => void save()} disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
        </div>
      </div>
      <ErrLine err={err} />
    </div>
  );
}

export function PlanCard({ meta, onChanged, onSend, onDeleted }: { meta: Meta; onChanged: () => void; onSend: (content: string, body: Record<string, unknown>) => void; onDeleted?: () => void }) {
  const plan = meta.plan!;
  const { err, busy, call, setErr } = useCall(onChanged);
  const [editing, setEditing] = useState(false);
  const editable = ["Draft", "Confirmed", "InProgress", "Paused"].includes(plan.status);
  const [start, setStart] = useState(tomorrow());
  const [at, setAt] = useState("19:00");
  const active = plan.status === "Confirmed" || plan.status === "InProgress";
  const exportable = active || plan.status === "Paused";
  const hasDates = !!plan.dates?.length;
  const starts = (start || hasDates) && at ? sessionStarts(plan.sessions, start, at, plan.dates) : new Map<string, Date>();

  const [picking, setPicking] = useState<string | null>(null); // buổi đang mở bộ chọn hình thức ôn tập
  function practice(s: PlanSession, choice: PracticeChoice) {
    const content = `Ôn tập ${dayLabel(plan.dates, s.day)} (${FORMAT_LABEL[choice.action]}, ${choice.count} câu): ${s.title}`;
    onSend(content, { content, assistant: "learning", learning: { action: choice.action, count: choice.count, topic: `${noCite(s.title)}. ${noCite(s.objective)}`, plan_id: plan.id } });
    setPicking(null);
  }
  async function remove() {
    if (!window.confirm(`Xoá lộ trình "${plan.goal}"? Không khôi phục được.`)) return;
    setErr(null);
    try {
      await api(`/learning/plans/${plan.id}`, { method: "DELETE" });
      (onDeleted ?? onChanged)();
    } catch (e) {
      setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }
  async function ics() {
    setErr(null);
    try {
      await downloadFile(`/learning/plans/${plan.id}/calendar.ics?${hasDates ? "" : `start=${start}&`}at=${at}`, `lo-trinh-${plan.id}.ics`);
    } catch (e) {
      setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }

  if (editing) return <PlanEditor plan={plan} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Lộ trình — {plan.goal}</strong>
        <div className="flex items-center gap-2">
          <span className={`rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[11px] ${muted}`}>{plan.status} · v{plan.version}</span>
          {editable && <button type="button" className={btn2} onClick={() => setEditing(true)}>✏️ Sửa</button>}
          <button type="button" className={`${btn2} text-red-600`} onClick={() => void remove()}>🗑 Xoá</button>
        </div>
      </div>
      <ol className="mt-3 space-y-3">
        {plan.sessions.slice().sort((a, b) => a.day - b.day).map((s) => (
          <li key={s.id} className={`rounded-xl border border-black/5 dark:border-white/10 p-3 ${s.needs_update ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{dayLabel(plan.dates, s.day)} · {s.minutes}′ — <M>{noCite(s.title)}</M></p>
                <p className="mt-0.5"><M>{noCite(s.objective)}</M></p>
                <p className={`mt-0.5 text-[12px] ${muted}`}><M>{noCite(s.activity)}</M> · Tự kiểm tra: <M>{noCite(s.self_check)}</M></p>
                {s.missing_source && <p className="text-[12px] text-amber-700">⚠ Thiếu nguồn cho buổi này</p>}
                {s.needs_update && <p className="text-[12px] text-amber-700">⚠ Nguồn đã thay đổi quyền/thu hồi — cần cập nhật</p>}
              </div>
              {active && (
                <select value={s.status} disabled={busy} aria-label={`Trạng thái ngày ${s.day}`}
                  onChange={(e) => void call("PATCH", `/learning/plans/${plan.id}/sessions/${s.id}`, { status: e.target.value })}
                  className="shrink-0 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-2 py-1 text-[12px]">
                  {Object.entries(SESSION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
            </div>
            {picking === s.id && <PracticePicker onPick={(c) => practice(s, c)} onCancel={() => setPicking(null)} />}
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" className={btn2} onClick={() => setPicking(picking === s.id ? null : s.id)}>📝 Ôn tập</button>
                {exportable && starts.get(s.id) && (
                  <a target="_blank" rel="noopener noreferrer" className="text-[12px] underline"
                    href={gcalLink(`EDU-04 · ${dayLabel(plan.dates, s.day)}: ${noCite(s.title)}`, `Mục tiêu: ${noCite(s.objective)}\nHoạt động: ${noCite(s.activity)}\nÔn tập: mở lộ trình trong EDU-04, bấm "Ôn tập" ngày ${s.day}.`, starts.get(s.id) as Date, s.minutes)}>
                    + Google Calendar
                  </a>
                )}
            </div>
          </li>
        ))}
      </ol>
      {plan.warnings.map((w, i) => <p key={i} className="mt-2 text-[12px] text-amber-700">⚠ {noCite(w)}</p>)}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[12px] ${muted}`}>Tổng: {plan.total_minutes} / {plan.budget_minutes} phút</span>
        <div className="flex gap-2">
          {plan.status === "Draft" && <button type="button" className={btn} disabled={busy} onClick={() => void call("POST", `/learning/plans/${plan.id}/confirm`)}>Xác nhận kế hoạch</button>}
          {active && <>
            <button type="button" className={btn2} disabled={busy} onClick={() => void call("POST", `/learning/plans/${plan.id}/status`, { status: "Paused" })}>Tạm dừng</button>
            <button type="button" className={btn2} disabled={busy} onClick={() => void call("POST", `/learning/plans/${plan.id}/status`, { status: "Cancelled" })}>Hủy</button>
          </>}
          {plan.status === "Paused" && <button type="button" className={btn2} disabled={busy} onClick={() => void call("POST", `/learning/plans/${plan.id}/status`, { status: "InProgress" })}>Tiếp tục</button>}
        </div>
      </div>
      {plan.status === "Draft" && <p className={`mt-2 text-[12px] ${muted}`}>Xác nhận kế hoạch để theo dõi tiến độ và đưa vào Google Calendar. Ôn tập dùng được ngay.</p>}
      {exportable && (
        <div className="mt-3 border-t border-dashed border-black/10 dark:border-white/10 pt-3">
          <p className="font-semibold">Đưa lộ trình vào Google Calendar</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            {hasDates
              ? <span>Theo {plan.dates!.length} ngày đã chọn</span>
              : <label>Bắt đầu <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-2 py-1" /></label>}
            <label>lúc <input type="time" value={at} onChange={(e) => setAt(e.target.value)} className="rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-2 py-1" /></label>
            <button type="button" className={btn} disabled={(!start && !hasDates) || !at} onClick={() => void ics()}>Tải file lịch (.ics)</button>
          </div>
          <p className={`mt-2 text-[12px] ${muted}`}>
            Tải file rồi mở <a className="underline" href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noopener noreferrer">Google Calendar → Cài đặt → Nhập</a>, hoặc bấm &quot;+ Google Calendar&quot; ở từng buổi. Mỗi buổi nhắc trước 15 phút.
          </p>
        </div>
      )}
      <ErrLine err={err} />
    </div>
  );
}

/* ---------- Flashcard / điền khuyết / cấp cứu ---------- */
function Flashcards({ meta, cx }: { meta: Meta; cx: CiteCtx }) {
  const items = meta.items ?? [];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  if (!items.length) return null;
  const c = items[i];
  const go = (d: number) => { setI((i + d + items.length) % items.length); setFlip(false); };
  return (
    <div className={card}>
      <button type="button" onClick={() => setFlip(!flip)} className="flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 p-5 text-center cursor-pointer">
        <span className={`text-[11px] uppercase tracking-wide ${muted}`}>{flip ? "Đáp án" : "Tự nhớ lại rồi bấm để lật"}</span>
        <span className="text-[16px] font-medium"><M>{flip ? c.back : c.front}</M></span>
      </button>
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-[12px] ${muted}`}>Thẻ {i + 1}/{items.length} · đã nhớ {known.size}</span>
        <div className="flex gap-2">
          <button type="button" className={btn2} onClick={() => go(-1)} aria-label="Thẻ trước">‹</button>
          {flip && <button type="button" className={btn2} onClick={() => { setKnown(new Set(known).add(i)); go(1); }}>Đã nhớ</button>}
          <button type="button" className={btn2} onClick={() => go(1)} aria-label="Thẻ sau">›</button>
        </div>
      </div>
      {flip && <Evidence ns={c.sources} ev={c.evidence} cx={cx} />}
    </div>
  );
}

/* ---------- Trắc nghiệm A–D tự ôn: chọn là biết đúng/sai + giải thích + nguồn ---------- */
function Mcq({ meta, cx }: { meta: Meta; cx: CiteCtx }) {
  const items = meta.items ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const answered = Object.keys(picked).length;
  const right = items.filter((it, k) => picked[k] === it.correct).length;
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-[12px] ${muted}`}>Đã làm {answered}/{items.length}</span>
        <span className="text-[13px] font-semibold">Đúng {right}/{answered || 0}</span>
      </div>
      {items.map((it, k) => {
        const done = picked[k] !== undefined;
        return (
          <div key={k} className="mb-4">
            <p className="font-medium">{k + 1}. <M>{noCite(it.question ?? "")}</M></p>
            <div className="mt-2 grid gap-1.5">
              {(it.options ?? []).map((o, i) => {
                const tone = !done
                  ? "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                  : i === it.correct
                    ? "border-green-500 bg-green-50 dark:bg-green-950/40"
                    : i === picked[k]
                      ? "border-red-400 bg-red-50 dark:bg-red-950/40"
                      : "border-black/10 dark:border-white/15 opacity-70";
                return (
                  <button key={i} type="button" disabled={done} onClick={() => setPicked({ ...picked, [k]: i })}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left bg-transparent cursor-pointer disabled:cursor-default ${tone}`}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/5 dark:bg-white/10 text-[12px] font-bold">{"ABCD"[i]}</span>
                    <span><M>{o}</M></span>
                  </button>
                );
              })}
            </div>
            {done && (
              <>
                <p className="mt-1 text-[13px]">
                  <span className={picked[k] === it.correct ? "font-semibold text-green-700 dark:text-green-400" : "font-semibold text-red-600"}>
                    {picked[k] === it.correct ? "✓ Đúng." : `✗ Chưa đúng — đáp án đúng: ${"ABCD"[it.correct ?? 0]}.`}
                  </span>{" "}
                  {it.explanation && <span className={muted}><M>{noCite(it.explanation)}</M></span>}
                </p>
                <Evidence ns={it.sources} ev={it.evidence} cx={cx} />
              </>
            )}
          </div>
        );
      })}
      {answered === items.length && items.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="font-semibold">Kết quả: {right}/{items.length}</span>
          <button type="button" className={btn2} onClick={() => setPicked({})}>Làm lại</button>
        </div>
      )}
    </div>
  );
}

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

function Cloze({ meta, cx }: { meta: Meta; cx: CiteCtx }) {
  const items = meta.items ?? [];
  const [vals, setVals] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const correct = items.filter((it, k) => norm(vals[k] ?? "") === norm(it.answer ?? "")).length;
  return (
    <div className={card}>
      {items.map((it, k) => {
        const [before, ...rest] = (it.sentence ?? "").split("____");
        const ok = norm(vals[k] ?? "") === norm(it.answer ?? "");
        return (
          <div key={k} className="mb-3 leading-8">
            {k + 1}. <M>{before}</M>
            <input value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} aria-label={`Chỗ trống câu ${k + 1}`}
              className={`mx-1 w-40 rounded-lg border px-2 py-0.5 outline-none bg-white dark:bg-black/30 ${checked ? (ok ? "border-green-500" : "border-red-500") : "border-black/15 dark:border-white/20"}`} />
            <M>{rest.join("____")}</M>
            {it.hint && !checked && <div className={`text-[12px] ${muted}`}>Gợi ý: <M>{it.hint}</M></div>}
            {checked && !ok && <div className="text-[12px] text-red-600">Đáp án: <M>{it.answer}</M></div>}
            {checked && <Evidence ns={it.sources} ev={it.evidence} cx={cx} />}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => setChecked(true)}>Kiểm tra</button>
        {checked && <>
          <span className="text-[13px]">Đúng {correct}/{items.length}</span>
          <button type="button" className={btn2} onClick={() => { setVals({}); setChecked(false); }}>Làm lại</button>
        </>}
      </div>
    </div>
  );
}

function Triage({ meta, cx }: { meta: Meta; cx: CiteCtx }) {
  const s = meta.sections;
  if (!s) return null;
  return (
    <div className={card}>
      <p className="font-semibold">1. Định nghĩa bắt buộc phải thuộc</p>
      <ul className="mb-3 ml-5 list-disc">{s.definitions.map((d, k) => <li key={k}>{d.term && <strong><M>{d.term}</M>: </strong>}<M>{d.text}</M> <Cites ns={d.sources} ev={d.evidence} cx={cx} /></li>)}</ul>
      <p className="font-semibold">2. Sai lầm / lưu ý cần tránh</p>
      {s.pitfalls.length === 0 ? <p className={`mb-3 ${muted}`}>Tài liệu không nêu rõ — không tự bịa thêm.</p> :
        <ul className="mb-3 ml-5 list-disc">{s.pitfalls.map((p, k) => <li key={k}><M>{p.text}</M> <Cites ns={p.sources} ev={p.evidence} cx={cx} /></li>)}</ul>}
      <p className="font-semibold">3. Ví dụ cốt lõi</p>
      <ol className="ml-5 list-decimal">{s.examples.map((e, k) => <li key={k}>{e.title && <strong><M>{e.title}</M>. </strong>}<M>{e.text}</M> <Cites ns={e.sources} ev={e.evidence} cx={cx} /></li>)}</ol>
      {(meta.notes ?? []).map((n, k) => <p key={k} className="mt-2 text-[12px] text-amber-700">⚠ {n}</p>)}
    </div>
  );
}

function HubResults({ meta, onOpenHub }: { meta: Meta; onOpenHub: (r: HubResult) => void }) {
  return (
    <div className="mt-3 space-y-2">
      {(meta.results ?? []).map((r) => (
        <button key={r.chunk_id} type="button" onClick={() => onOpenHub(r)} className="w-full text-left rounded-xl p-3 bg-white/70 dark:bg-black/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer border-0">
          <span className="block font-medium">{r.title} <span className={`font-normal text-[12px] ${muted}`}>· bản {r.version_label} · {r.locator.type === "page" ? "trang" : "slide"} {r.locator.value}</span></span>
          <span className={`block text-[12px] mt-1 ${muted}`}>“{r.snippet}…”</span>
        </button>
      ))}
    </div>
  );
}

export function LearningCards(props: {
  meta: Meta | undefined;
  messageId: string;
  onSource: (s: Source) => void;
  onChanged: () => void;
  onSend: (content: string, body: Record<string, unknown>) => void;
  onOpenHub: (r: HubResult) => void;
  sources?: Source[]; // nguồn của câu trả lời — chỉ dùng làm dẫn chứng SAU khi người học trả lời
}) {
  const { meta } = props;
  const cx: CiteCtx = { sources: props.sources ?? [], onSource: props.onSource };
  if (!meta) return null;
  if ((meta.kind === "quiz" || meta.kind === "diagnose") && meta.questions?.length)
    return <QuizCard meta={meta} messageId={props.messageId} onChanged={props.onChanged} cx={cx} />;
  if (meta.kind === "plan" && meta.plan) return <PlanCard meta={meta} onChanged={props.onChanged} onSend={props.onSend} />;
  if (meta.kind === "flashcards") return <Flashcards meta={meta} cx={cx} />;
  if (meta.kind === "cloze") return <Cloze meta={meta} cx={cx} />;
  if (meta.kind === "mcq") return <Mcq meta={meta} cx={cx} />;
  if (meta.kind === "triage") return <Triage meta={meta} cx={cx} />;
  if (meta.kind === "hub" && meta.results?.length) return <HubResults meta={meta} onOpenHub={props.onOpenHub} />;
  return null;
}

/* ---------- Bộ chọn hình thức ôn tập (dùng ở lộ trình và Trung tâm học) ---------- */
export type PracticeChoice = { action: "mcq" | "quiz" | "flashcards" | "cloze"; count: number };
export const FORMAT_LABEL: Record<PracticeChoice["action"], string> = {
  mcq: "Trắc nghiệm A–D",
  quiz: "Tự luận ngắn (AI đánh giá)",
  flashcards: "Flashcard",
  cloze: "Điền khuyết",
};
const FORMAT_HINT: Record<PracticeChoice["action"], string> = {
  mcq: "Chọn đáp án, biết đúng/sai ngay kèm giải thích",
  quiz: "Tự viết câu trả lời, AI đánh giá mức hiểu",
  flashcards: "Tự nhớ lại rồi lật thẻ",
  cloze: "Điền thuật ngữ còn thiếu",
};

export function PracticePicker({ onPick, onCancel, busy }: { onPick: (c: PracticeChoice) => void; onCancel?: () => void; busy?: boolean }) {
  const [action, setAction] = useState<PracticeChoice["action"]>("mcq");
  const [count, setCount] = useState(10);
  return (
    <div className="mt-2 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/20 p-3">
      <p className="text-[13px] font-semibold">Ôn tập theo hình thức</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(Object.keys(FORMAT_LABEL) as PracticeChoice["action"][]).map((a) => (
          <button key={a} type="button" onClick={() => setAction(a)}
            className={`rounded-xl border-2 p-2 text-left cursor-pointer bg-transparent ${action === a ? "border-[#4f2b96] bg-[#f5f3ff] dark:bg-white/10" : "border-black/10 dark:border-white/15"}`}>
            <span className="block text-[13px] font-medium">{FORMAT_LABEL[a]}</span>
            <span className={`block text-[12px] ${muted}`}>{FORMAT_HINT[a]}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px]">Số câu:</span>
        {[5, 10, 15, 20].map((n) => (
          <button key={n} type="button" onClick={() => setCount(n)}
            className={`rounded-full px-3 py-1 text-[13px] cursor-pointer border-2 ${count === n ? "border-[#4f2b96] text-[#4f2b96] bg-transparent" : "border-transparent bg-black/5 dark:bg-white/10"}`}>{n}</button>
        ))}
        <span className="flex-1" />
        {onCancel && <button type="button" className={btn2} onClick={onCancel}>Hủy</button>}
        <button type="button" className={btn} disabled={busy} onClick={() => onPick({ action, count })}>{busy ? "Đang tạo…" : "Bắt đầu ôn tập"}</button>
      </div>
    </div>
  );
}

/* ---------- Gợi ý bắt đầu nhanh (gửi thẳng cho router, hoặc điền sẵn câu mẫu) ---------- */
const QUICK: ({ icon: string; label: string } & ({ send: string } | { fill: string }))[] = [
  { icon: "🧭", label: "Tôi không biết bắt đầu từ đâu", send: "Tôi mới học, không biết bắt đầu từ đâu — kiểm tra nhanh kiến thức nền giúp mình" },
  { icon: "🃏", label: "Tạo flashcard", fill: "Tạo flashcard về " },
  { icon: "✏️", label: "Bài điền khuyết", fill: "Tạo bài điền khuyết về " },
  { icon: "💡", label: "Giải thích bằng ví dụ đời thường", fill: "Giải thích … bằng ví dụ về " },
  { icon: "🗓️", label: "Lập lộ trình học", fill: "Lập lộ trình học … trong 7 ngày, mỗi ngày 45 phút" },
  { icon: "🚑", label: "Cấp cứu: sắp thi", fill: "Mai thi phần …, ôn cấp tốc giúp mình" },
];

export function QuickStart({ onSend, onFill }: { onSend: (text: string) => void; onFill: (text: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {QUICK.map((q) => (
        <button key={q.label} type="button" onClick={() => ("send" in q ? onSend(q.send) : onFill(q.fill))}
          className="rounded-xl border border-border/80 bg-card/75 dark:bg-card/60 px-3.5 py-2 text-[12.5px] font-medium text-foreground/85 cursor-pointer hover:bg-secondary/80 hover:text-foreground hover:border-primary/30 active:scale-95 backdrop-blur-md shadow-2xs transition-all">
          <span aria-hidden="true">{q.icon}</span> {q.label}
        </button>
      ))}
    </div>
  );
}
