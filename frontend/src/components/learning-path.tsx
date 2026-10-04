"use client";

// Lộ trình theo tiến độ (D-82): khai báo đã học tới bài nào → bài đánh giá CHỈ trong phạm vi đó → kết quả theo bài/chủ đề/
// mục tiêu + lỗ hổng có giải thích → chọn 1 trong 3 phương án lộ trình → lộ trình có thứ tự, hoạt động, checkpoint.
// Mọi quyết định (phạm vi, chấm, chẩn đoán, lộ trình) ở server; trang chỉ hiển thị và gửi thao tác của người học.

import { useCallback, useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { ApiError, api, json, type CourseItem } from "@/lib/api";
import { LEVEL_LABEL, MSG, errorMessage } from "@/lib/messages";

type Lesson = { id: string; order: number; title: string; topics: { id: string; title: string }[] };
type Curriculum = { course_id: string; source: "authored" | "derived"; notes: string[]; lessons: Lesson[] };
type Progress = { covered_lesson_ids: string[]; current_lesson: { id: string; title: string; order: number } | null; next_lesson: { id: string; title: string; order: number } | null; covered_topics: number; total_topics: number };
type MasteryTopic = { topic_id: string; title: string; level: string; mastery: number | null; confidence: string | null; assessed: boolean };
type Mastery = { lessons: { lesson_id: string; order: number; title: string; covered: boolean; topics: MasteryTopic[] }[] };
type Ref = { document_title: string | null; page: number | null; page_end: number | null };
type Question = { id: string; text: string; options: string[]; withdrawn?: boolean; lesson_title?: string | null; topic_title?: string | null; objective?: string | null; picked?: number | null; correct?: number; explanation?: string; proof?: string; source?: Ref | null };
type Gap = { topic_id: string; topic_title: string; lesson_title: string; lesson_order: number; level: string; missing_concepts: string[]; why: string; evidence: { question: string; picked_text: string; correct_text: string; indicates: string }[]; review: { lesson_title: string; topic_title: string; sources: Ref[] }; root_causes: { title: string; lesson_title: string }[] };
type Option = { strategy: string; title: string; description: string; suits: string; recommended: boolean; rationale: string; preview: string[]; summary: { steps: number; total_minutes: number; checkpoints: number; new_lessons: string[] } };
type Result = {
  summary: { total: number; answered: number; correct: number; score_pct: number | null };
  lessons: { lesson_id: string; title: string; order: number; answered: number; correct: number; level: string }[];
  topics: { topic_id: string; title: string; lesson_title: string; answered: number; correct: number; level: string; confidence: string; objectives: { id: string; text: string; status: string }[] }[];
  gaps: Gap[]; recommendations: { kind: string; text: string }[]; path_options: Option[]; recommended_strategy: string;
};
type Assessment = { id: string; purpose: string; status: string; path_id: string | null; step_id: string | null; scope: { lessons: { id: string; title: string; order: number }[]; not_assessed: { title: string; reason_text: string }[] }; questions: Question[]; result: Result | null };
type Step = { id: string; order: number; kind: string; title: string; lesson_title?: string | null; topic_titles?: string[]; objectives: string[]; activities: { type: string; label: string }[]; sources: Ref[]; minutes: number; status: string; locked?: boolean; needs_update?: boolean; unlock?: string; concepts?: string[]; remediation?: number; round?: number; result?: { score_pct: number | null; passed: boolean } };
type Path = { id: string; strategy: string; status: string; summary: { title: string; description: string; total_minutes: number }; steps: Step[]; done: number; total: number; next_step_id: string | null };
type Row = { id: string; status: string; title?: string; purpose?: string; score_pct?: number | null; created_at: string };

const card = "rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#12181f] p-5";
const btn = "rounded-full px-4 py-1.5 text-[13px] font-medium cursor-pointer border-0 bg-black text-white dark:bg-white dark:text-black hover:opacity-80 disabled:opacity-40";
const btn2 = "rounded-full px-3 py-1 text-[12px] cursor-pointer border border-black/10 dark:border-white/15 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";
const muted = "text-black/50 dark:text-white/50";
const LEVEL_COLOR: Record<string, string> = {
  solid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  needs_reinforcement: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  missing_foundation: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  insufficient_data: "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60",
};
const STEP_KIND: Record<string, string> = { review: "Ôn nền tảng", reinforce: "Củng cố", refresh: "Ôn nhanh", learn: "Học bài mới", checkpoint: "Kiểm tra" };
const CHAT_ACTIONS = new Set(["explain", "quiz", "mcq", "flashcards", "cloze"]);
const errText = (e: unknown) => (e instanceof ApiError ? e.detail || errorMessage(e.code) : MSG.serviceError);
const where = (r: Ref) => (r.document_title ? `${r.document_title}${r.page ? `, trang ${r.page}${r.page_end && r.page_end !== r.page ? `–${r.page_end}` : ""}` : ""}` : "");

function Level({ level }: { level: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${LEVEL_COLOR[level] ?? LEVEL_COLOR.insufficient_data}`}>{LEVEL_LABEL[level] ?? level}</span>;
}

/** onFind: tìm tài liệu học theo nội dung (Knowledge Hub trong chat) cho chủ đề của một bước lộ trình. */
export function ProgressPath({ courses, onPractice, onFind }: { courses: CourseItem[]; onPractice: (courseId: string, action: string, topic: string, label: string) => void; onFind: (courseId: string, query: string) => void }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [cur, setCur] = useState<Curriculum | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mastery, setMastery] = useState<Mastery | null>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [open, setOpen] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    const q = `course_id=${encodeURIComponent(courseId)}`;
    try {
      const [c, p, m, paths, as] = await Promise.all([
        api<Curriculum>(`/learning/curriculum?${q}`), api<Progress>(`/learning/progress?${q}`), api<Mastery>(`/learning/mastery?${q}`),
        api<{ items: Row[] }>(`/learning/paths?${q}`), api<{ items: Row[] }>(`/learning/assessments?${q}`),
      ]);
      setCur(c); setProgress(p); setMastery(m); setHistory(as.items);
      const active = paths.items.find((x) => x.status === "Active");
      setPath(active ? await api<Path>(`/learning/paths/${active.id}`) : null);
    } catch (e) {
      setErr(errText(e));
    }
  }, [courseId]);

  // load() chỉ setState sau await (dữ liệu từ server) — không phải setState đồng bộ trong effect
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function run<T>(f: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setErr(null);
    try { return await f(); } catch (e) { setErr(errText(e)); return undefined; } finally { setBusy(false); }
  }

  const setLesson = (lessonId: string) => run(async () => {
    setProgress(await api<Progress>("/learning/progress", { method: "PUT", body: json({ course_id: courseId, current_lesson_id: lessonId }) }));
    await load();
  });
  const startAssessment = (extra: Record<string, unknown> = {}) => run(async () => {
    setOpen(await api<Assessment>("/learning/assessments", { method: "POST", body: json({ course_id: courseId, ...extra }) }));
  });
  const choose = (assessmentId: string, strategy: string) => run(async () => {
    setPath(await api<Path>(`/learning/assessments/${assessmentId}/path`, { method: "POST", body: json({ strategy }) }));
    setOpen(null);
    await load();
  });
  const setStep = (stepId: string, status: string) => run(async () => {
    if (!path) return;
    setPath(await api<Path>(`/learning/paths/${path.id}/steps/${stepId}`, { method: "POST", body: json({ status }) }));
    await load();
  });

  if (open) {
    return (
      <AssessmentPanel a={open} busy={busy} err={err} onClose={() => { setOpen(null); void load(); }}
        onSubmit={(answers) => run(async () => setOpen(await api<Assessment>(`/learning/assessments/${open.id}/submit`, { method: "POST", body: json({ answers }) })))}
        onChoose={(s) => void choose(open.id, s)} />
    );
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Compass size={18} /> Lộ trình theo tiến độ</h2>
          <p className={`mt-1 text-sm ${muted}`}>Cho biết bạn đã học tới bài nào → làm bài đánh giá chỉ trong phạm vi đó → xem lỗ hổng và chọn lộ trình.</p>
        </div>
        {courses.length > 1 && (
          <select className="rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-sm" value={courseId}
            onChange={(e) => { setCourseId(e.target.value); setPath(null); setCur(null); }}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {err && <p className="mt-3 rounded-xl bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-200">{err}</p>}
      {!cur ? <p className={`mt-3 text-sm ${muted}`}>Đang tải…</p> : cur.lessons.length === 0 ? (
        <p className={`mt-3 text-sm ${muted}`}>Môn này chưa có tài liệu/đề cương để dựng chương trình học.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Đã học tới:</span>
            <select disabled={busy} className="rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-2 py-1"
              value={progress?.current_lesson?.id ?? ""} onChange={(e) => e.target.value && void setLesson(e.target.value)}>
              <option value="">— chọn bài —</option>
              {cur.lessons.map((l) => <option key={l.id} value={l.id}>Bài {l.order}: {l.title}</option>)}
            </select>
            {progress && <span className={muted}>{progress.covered_topics}/{progress.total_topics} chủ đề trong phạm vi đã học</span>}
            <button type="button" className={btn} disabled={busy || !progress?.covered_lesson_ids.length} onClick={() => void startAssessment()}>
              {busy ? "Đang soạn…" : "Làm bài đánh giá"}
            </button>
          </div>
          {cur.source === "derived" && <p className={`text-[12px] ${muted}`}>{cur.notes[0]}</p>}

          {mastery && (
            <div className="grid gap-2 md:grid-cols-2">
              {mastery.lessons.filter((l) => l.covered).map((l) => (
                <div key={l.lesson_id} className="rounded-xl border border-black/5 dark:border-white/10 p-3">
                  <p className="text-[13px] font-medium">Bài {l.order}: {l.title} <span className={`font-normal ${muted}`}>· đã học</span></p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.topics.map((t) => (
                      <span key={t.topic_id} className="flex items-center gap-1 text-[12px]">
                        {t.title} <Level level={t.level} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {path && (
            <PathPanel path={path} busy={busy} onStep={(id, s) => void setStep(id, s)}
              onCheckpoint={(stepId) => void startAssessment({ path_id: path.id, step_id: stepId })}
              onPractice={(action, topic, label) => onPractice(courseId, action, topic, label)}
              onFind={(query) => onFind(courseId, query)} />
          )}

          {history.length > 0 && (
            <details>
              <summary className={`cursor-pointer text-sm ${muted}`}>Các bài đánh giá trước ({history.length})</summary>
              <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{h.purpose === "checkpoint" ? "Kiểm tra theo lộ trình" : "Đánh giá theo tiến độ"} · {new Date(h.created_at).toLocaleDateString("vi-VN")}
                      {h.score_pct != null && ` · ${h.score_pct}%`}</span>
                    <button type="button" className={btn2} onClick={() => void run(async () => setOpen(await api<Assessment>(`/learning/assessments/${h.id}`)))}>
                      {h.status === "Open" ? "Làm tiếp" : "Xem lại"}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function AssessmentPanel({ a, busy, err, onClose, onSubmit, onChoose }: { a: Assessment; busy: boolean; err: string | null; onClose: () => void; onSubmit: (answers: Record<string, number>) => void; onChoose: (strategy: string) => void }) {
  const [picked, setPicked] = useState<Record<string, number>>(() =>
    Object.fromEntries(a.questions.filter((q) => q.picked != null).map((q) => [q.id, q.picked as number])));
  const done = a.status === "Submitted";
  const r = a.result;
  return (
    <section className={`${card} space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{a.purpose === "checkpoint" ? "Bài kiểm tra theo lộ trình" : "Bài đánh giá theo tiến độ"}</h2>
          <p className={`text-[12px] ${muted}`}>Phạm vi: {a.scope.lessons.map((l) => `Bài ${l.order}`).join(", ")} · {a.questions.length} câu · tự đánh giá, không tính điểm</p>
        </div>
        <button type="button" className={btn2} onClick={onClose}>Đóng</button>
      </div>
      {err && <p className="rounded-xl bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-200">{err}</p>}
      {a.scope.not_assessed.length > 0 && (
        <p className={`text-[12px] ${muted}`}>Chưa hỏi lượt này: {a.scope.not_assessed.map((n) => `${n.title} (${n.reason_text})`).join("; ")}</p>
      )}

      {r && (
        <div className="space-y-3">
          <p className="text-sm">Đúng {r.summary.correct}/{r.summary.answered} câu đã trả lời{r.summary.score_pct != null && ` (${r.summary.score_pct}%)`}.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {r.topics.map((t) => (
              <div key={t.topic_id} className="rounded-xl border border-black/5 dark:border-white/10 p-3 text-[13px]">
                <p className="flex items-center justify-between gap-2 font-medium">{t.title} <Level level={t.level} /></p>
                <p className={muted}>{t.lesson_title} · đúng {t.correct}/{t.answered}{t.confidence === "low" && " · cần thêm câu để chắc chắn"}</p>
                <ul className="mt-1 list-disc pl-4">{t.objectives.map((o) => <li key={o.id}>{o.status === "met" ? "✓" : o.status === "not_answered" ? "…" : "✗"} {o.text}</li>)}</ul>
              </div>
            ))}
          </div>
          {r.gaps.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Lỗ hổng kiến thức</h3>
              {r.gaps.map((g) => (
                <div key={g.topic_id} className="rounded-xl border border-black/5 dark:border-white/10 p-3 text-[13px]">
                  <p className="flex items-center gap-2 font-medium">{g.topic_title} <Level level={g.level} /></p>
                  <p><b>Còn thiếu:</b> {g.missing_concepts.join("; ")}</p>
                  <p><b>Vì sao:</b> {g.why}</p>
                  <ul className="list-disc pl-4">{g.evidence.map((e, i) => <li key={i}>Chọn “{e.picked_text}” — {e.indicates}</li>)}</ul>
                  {g.root_causes.length > 0 && <p><b>Nguyên nhân gốc:</b> chưa vững {g.root_causes.map((x) => `“${x.title}” (${x.lesson_title})`).join(", ")}</p>}
                  <p><b>Xem lại:</b> Bài {g.lesson_order}: {g.review.lesson_title} — {g.review.topic_title}{g.review.sources.map(where).filter(Boolean).map((s) => ` · ${s}`).join("")}</p>
                </div>
              ))}
            </div>
          )}
          <div>
            <h3 className="font-semibold">Gợi ý cho bạn</h3>
            <ul className="mt-1 list-disc pl-5 text-[13px]">{r.recommendations.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
          </div>
          {!a.path_id && (
            <div>
              <h3 className="font-semibold">Chọn lộ trình</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {r.path_options.map((o) => (
                  <div key={o.strategy} className={`rounded-xl border p-3 text-[13px] ${o.recommended ? "border-black dark:border-white" : "border-black/10 dark:border-white/10"}`}>
                    <p className="font-medium">{o.title}{o.recommended && " · đề xuất"}</p>
                    <p className={muted}>{o.description}</p>
                    {o.rationale && <p className="mt-1">{o.rationale}</p>}
                    <p className={`mt-1 ${muted}`}>{o.summary.steps} bước · ~{o.summary.total_minutes} phút · {o.summary.checkpoints} lần kiểm tra</p>
                    <ol className="mt-1 list-decimal pl-4">{o.preview.map((p, i) => <li key={i}>{p}</li>)}</ol>
                    <button type="button" className={`${btn} mt-2`} disabled={busy} onClick={() => onChoose(o.strategy)}>Chọn lộ trình này</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {a.questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-black/5 dark:border-white/10 p-3 text-sm">
            {q.withdrawn ? <p className={muted}>{q.text}</p> : (
              <>
                <p className={`text-[11px] ${muted}`}>{q.lesson_title} · {q.topic_title}</p>
                <p className="font-medium">{i + 1}. {q.text}</p>
                <div className="mt-2 grid gap-1">
                  {q.options.map((o, k) => {
                    const mark = done ? (k === q.correct ? " ✓" : k === q.picked ? " ✗" : "") : "";
                    return (
                      <label key={k} className="flex cursor-pointer items-start gap-2">
                        <input type="radio" name={q.id} disabled={done} checked={(done ? q.picked : picked[q.id]) === k} onChange={() => setPicked((p) => ({ ...p, [q.id]: k }))} />
                        <span>{String.fromCharCode(65 + k)}. {o}{mark}</span>
                      </label>
                    );
                  })}
                </div>
                {done && q.explanation && <p className={`mt-1 text-[12px] ${muted}`}>{q.explanation}{q.source && ` — ${where(q.source)}`}</p>}
              </>
            )}
          </li>
        ))}
      </ol>
      {!done && (
        <button type="button" className={btn} disabled={busy || Object.keys(picked).length === 0} onClick={() => onSubmit(picked)}>
          {busy ? "Đang chấm…" : `Nộp bài (${Object.keys(picked).length}/${a.questions.length} câu)`}
        </button>
      )}
    </section>
  );
}

function PathPanel({ path, busy, onStep, onCheckpoint, onPractice, onFind }: { path: Path; busy: boolean; onStep: (id: string, status: string) => void; onCheckpoint: (stepId: string) => void; onPractice: (action: string, topic: string, label: string) => void; onFind: (query: string) => void }) {
  const [picking, setPicking] = useState<string | null>(null); // bước đang mở danh sách khái niệm để nhờ giải thích
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
      <p className="font-medium">{path.summary.title} <span className={`font-normal ${muted}`}>· {path.done}/{path.total} bước · ~{path.summary.total_minutes} phút</span></p>
      <p className={`text-[12px] ${muted}`}>{path.summary.description}</p>
      <ol className="mt-2 space-y-2">
        {path.steps.map((s) => {
          const context = `${s.title}. ${s.objectives.join("; ")}`.slice(0, 600);
          const topics = (s.topic_titles ?? []).join(", ") || s.title;
          const failed = s.kind === "checkpoint" && s.status === "done" && s.result && !s.result.passed;
          return (
            <li key={s.id} className={`rounded-lg p-2 text-[13px] ${s.id === path.next_step_id ? "bg-black/5 dark:bg-white/10" : ""} ${s.remediation || s.round ? "border-l-2 border-amber-500 pl-3" : ""}`}>
              <p className="font-medium">{s.order}. <span className={muted}>[{s.remediation ? "Ôn lại" : STEP_KIND[s.kind] ?? s.kind}]</span> {s.title}
                {s.status === "done" && " ✓"}{s.result && ` · ${s.result.score_pct ?? "—"}% ${s.result.passed ? "(đạt)" : "(chưa đạt)"}`}</p>
              {failed && <p className="text-amber-700 dark:text-amber-300">Chưa đạt — làm các bước “Ôn lại” bên dưới rồi kiểm tra lại; đạt mới mở bài mới.</p>}
              {!s.needs_update && (
                <>
                  {s.objectives.length > 0 && s.kind !== "checkpoint" && <p className={muted}>Mục tiêu: {s.objectives.slice(0, 3).join("; ")}</p>}
                  {s.sources.length > 0 && <p className={muted}>Đọc: {s.sources.map(where).filter(Boolean).join("; ")}</p>}
                  {s.locked && <p className="text-amber-700 dark:text-amber-300">🔒 {s.unlock}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.activities.filter((x) => x.type === "find").map((x, i) => (
                      <button key={`f${i}`} type="button" className={btn2} disabled={s.locked} onClick={() => onFind(topics)}>🔎 {x.label}</button>
                    ))}
                    {s.activities.filter((x) => CHAT_ACTIONS.has(x.type)).map((x, i) => (
                      <button key={i} type="button" className={btn2} disabled={s.locked}
                        onClick={() => (x.type === "explain" && s.concepts?.length ? setPicking(picking === s.id ? null : s.id) : onPractice(x.type, context, x.label))}>
                        {x.label}{x.type === "explain" && s.concepts?.length ? (picking === s.id ? " ▴" : " ▾") : ""}
                      </button>
                    ))}
                    {s.kind === "checkpoint" ? (
                      s.status !== "done" && <button type="button" className={btn2} disabled={busy} onClick={() => onCheckpoint(s.id)}>Làm bài kiểm tra</button>
                    ) : (
                      <>
                        {s.status === "not_started" && <button type="button" className={btn2} disabled={busy || s.locked} onClick={() => onStep(s.id, "in_progress")}>Bắt đầu</button>}
                        {s.status !== "done" && <button type="button" className={btn2} disabled={busy || s.locked} onClick={() => onStep(s.id, "done")}>Đã xong</button>}
                      </>
                    )}
                  </div>
                  {picking === s.id && !!s.concepts?.length && (
                    <div className="mt-2 rounded-lg border border-black/10 dark:border-white/10 p-2">
                      <p className={`text-[12px] ${muted}`}>Chọn khái niệm bạn muốn trợ lý giải thích từng bước:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.concepts.map((c) => (
                          <button key={c} type="button" className={btn2} onClick={() => { setPicking(null); onPractice("explain", `${c} (chủ đề: ${topics})`.slice(0, 600), `Giải thích: ${c}`); }}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
