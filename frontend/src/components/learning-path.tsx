"use client";

// Lộ trình theo tiến độ (D-82): khai báo đã học tới bài nào → bài đánh giá CHỈ trong phạm vi đó → kết quả theo bài/chủ đề/
// mục tiêu + lỗ hổng có giải thích → nhận xét của LLM → chọn 1 trong 1–3 phương án lộ trình phù hợp → lộ trình có thứ tự, hoạt động, checkpoint.
// Mọi quyết định (phạm vi, chấm, chẩn đoán, lộ trình) ở server; trang chỉ hiển thị và gửi thao tác của người học.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ChevronRight, Compass, Loader2, X } from "lucide-react";
import { ApiError, api, json, type CourseItem } from "@/lib/api";
import { LEVEL_LABEL, MSG, errorMessage } from "@/lib/messages";
import { CitationBadge } from "@/components/chat/CitationBadge";
import SourceReader from "@/components/source-reader";
import type { Source } from "@/types/chat";
import { pinStudy, unpinPrefix } from "@/lib/study-pins";
import { FORMAT_LABEL, PracticePicker } from "@/components/count-picker";

type Lesson = { id: string; order: number; title: string; topics: { id: string; title: string }[] };
type Curriculum = { course_id: string; source: "authored" | "derived"; notes: string[]; lessons: Lesson[] };
type Progress = { covered_lesson_ids: string[]; current_lesson: { id: string; title: string; order: number } | null; next_lesson: { id: string; title: string; order: number } | null; covered_topics: number; total_topics: number };
type MasteryTopic = { topic_id: string; title: string; level: string; mastery: number | null; confidence: string | null; assessed: boolean };
type Mastery = { lessons: { lesson_id: string; order: number; title: string; covered: boolean; topics: MasteryTopic[] }[] };
// Nguồn từ server: đã kiểm quyền lúc trả; có bản (version_id) thì mở được trang, quote = đoạn dẫn chứng nguyên văn
type Ref = { document_id?: string | null; version_id?: string | null; document_title: string | null; page: number | null; page_end: number | null; quote?: string };
type Question = { id: string; topic_id?: string; text: string; options: string[]; withdrawn?: boolean; lesson_title?: string | null; topic_title?: string | null; objective?: string | null; picked?: number | null; correct?: number; explanation?: string; proof?: string; source?: Ref | null };
type Gap = { topic_id: string; topic_title: string; lesson_title: string; lesson_order: number; level: string; missing_concepts: string[]; why: string; evidence: { question: string; picked_text: string; correct_text: string; indicates: string }[]; review: { lesson_title: string; topic_title: string; sources: Ref[] }; root_causes: { title: string; lesson_title: string }[] };
type Option = { strategy: string; title: string; description: string; suits: string; recommended: boolean; rationale: string; preview: string[]; summary: { steps: number; total_minutes: number; checkpoints: number; new_lessons: string[] } };
type Result = {
  summary: { total: number; answered: number; correct: number; score_pct: number | null };
  lessons: { lesson_id: string; title: string; order: number; answered: number; correct: number; level: string }[];
  topics: { topic_id: string; title: string; lesson_title: string; answered: number; correct: number; level: string; confidence: string; objectives: { id: string; text: string; status: string }[] }[];
  gaps: Gap[]; recommendations: { kind: string; text: string; topic_id?: string; sources?: Ref[] }[]; path_options: Option[]; recommended_strategy: string;
  review?: { overview: string; advice: string[]; path_hint: string } | null; // LLM nhận xét trên kết quả đã chấm bằng code
};
type Assessment = { id: string; purpose: string; status: string; path_id: string | null; step_id: string | null; scope: { lessons: { id: string; title: string; order: number }[] }; questions: Question[]; result: Result | null };
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
const PASS_PCT = 80; // = roadmap.PASS_MASTERY (backend quyết định đạt/chưa đạt; chỉ để hiển thị)
const STEP_KIND: Record<string, string> ={ review: "Ôn nền tảng", reinforce: "Củng cố", refresh: "Ôn nhanh", learn: "Học bài mới", checkpoint: "Kiểm tra" };
const CHAT_ACTIONS = new Set(["explain", "quiz", "mcq", "flashcards", "cloze"]);
const errText = (e: unknown) => (e instanceof ApiError ? e.detail || errorMessage(e.code) : MSG.serviceError);
const where = (r: Ref) => (r.document_title ? `${r.document_title}${r.page ? `, trang ${r.page}${r.page_end && r.page_end !== r.page ? `–${r.page_end}` : ""}` : ""}` : "");

/** Đang chờ server (soạn đề / chấm + nhận xét có gọi LLM — có thể vài chục giây): vòng quay + số giây đã chờ để người
 *  học không tưởng là bị treo/lỗi. Dính trên cùng khung để luôn thấy dù đang cuộn ở cuối bài. */
function Pending({ text }: { text: string }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="sticky top-2 z-20 flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#12181f]/95 px-4 py-3 text-sm shadow-md backdrop-blur">
      <Loader2 size={20} className="shrink-0 animate-spin" aria-hidden="true" />
      <div>
        <p className="font-medium">{text}</p>
        <p className={`text-[12px] ${muted}`}>Đã chờ {sec} giây · thường mất 20–60 giây, vui lòng không tải lại trang.</p>
      </div>
    </div>
  );
}

function Level({ level }: { level: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${LEVEL_COLOR[level] ?? LEVEL_COLOR.insufficient_data}`}>{LEVEL_LABEL[level] ?? level}</span>;
}

/** onFind: tìm tài liệu học theo nội dung (Knowledge Hub trong chat) cho chủ đề của một bước lộ trình. */
/** Mở trang nguồn của một trích dẫn: trong chat là khung nguồn bên phải; ở trang Ôn tập là khung trượt riêng. */
const OpenSource = createContext<(s: Source) => void>(() => {});

/** Nguồn dạng trích dẫn như trong chat: rê chuột hiện đoạn dẫn chứng + trang, bấm mở trang tài liệu. */
/** `bare`: chỉ nút trang (bấm mở) — không lặp tên tài liệu khi ngữ cảnh đã rõ. */
function Refs({ refs, bare = false }: { refs: Ref[]; bare?: boolean }) {
  const open = useContext(OpenSource);
  return (
    <>
      {refs.map((r, i) => {
        if (!r.document_id || !r.version_id) return where(r) && !bare ? <span key={i}> · {where(r)}</span> : null;
        const page = r.page ?? 1;
        const label = r.page ? `tr. ${r.page}${r.page_end && r.page_end !== r.page ? `–${r.page_end}` : ""}` : "mở";
        const source: Source = { id: `${r.version_id}-${page}-${i}`, title: r.document_title ?? "", page, pageEnd: r.page_end ?? null,
          content: r.quote ?? "", documentId: r.document_id, versionId: r.version_id };
        return <span key={i} className="whitespace-nowrap">{bare ? " " : ` · ${r.document_title}`}<CitationBadge source={source} onClick={open} label={label} /></span>;
      })}
    </>
  );
}

type ProgressPathProps = { courses: CourseItem[]; onPractice: (courseId: string, action: string, topic: string, label: string, count?: number) => void; onFind: (courseId: string, query: string) => void };

/** onSource: cách mở trang nguồn của nơi chứa (chat có khung nguồn riêng); không truyền → khung trượt của khối này. */
export function ProgressPath({ onSource, ...props }: ProgressPathProps & { onSource?: (s: Source) => void }) {
  const [viewing, setViewing] = useState<Source | null>(null);
  return (
    <OpenSource.Provider value={onSource ?? setViewing}>
      <ProgressPathBody {...props} />
      {viewing && (
        <div role="dialog" aria-modal="true" aria-label="Trích dẫn nguồn" className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setViewing(null)}>
          <div className="h-full w-[min(560px,100vw)] overflow-y-auto bg-white dark:bg-[#0c1219] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[14px] font-semibold">Trích dẫn nguồn · {viewing.title}</span>
              <button type="button" aria-label="Đóng" className={btn2} onClick={() => setViewing(null)}><X size={16} /></button>
            </div>
            {viewing.content && <p className={`mb-3 border-l-2 border-black/20 dark:border-white/20 pl-2 text-[13px] ${muted}`}>“{viewing.content}”</p>}
            <SourceReader key={`${viewing.versionId}-${viewing.page}`} source={{ documentId: viewing.documentId, versionId: viewing.versionId, page: viewing.page }} />
          </div>
        </div>
      )}
    </OpenSource.Provider>
  );
}

function ProgressPathBody({ courses, onPractice, onFind }: ProgressPathProps) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [cur, setCur] = useState<Curriculum | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mastery, setMastery] = useState<Mastery | null>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [open, setOpen] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null); // thao tác chậm đang chạy → hiện <Pending>
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

  async function run<T>(f: () => Promise<T>, slow?: string): Promise<T | undefined> {
    setBusy(true); setErr(null); setPending(slow ?? null);
    try { return await f(); } catch (e) { setErr(errText(e)); return undefined; } finally { setBusy(false); setPending(null); }
  }

  const setLesson = (lessonId: string) => run(async () => {
    setProgress(await api<Progress>("/learning/progress", { method: "PUT", body: json({ course_id: courseId, current_lesson_id: lessonId }) }));
    await load();
  });
  const startAssessment = (extra: Record<string, unknown> = {}) => run(async () => {
    setOpen(await api<Assessment>("/learning/assessments", { method: "POST", body: json({ course_id: courseId, ...extra }) }));
  }, "Đang soạn đề từ tài liệu các bài đã học…");
  const choose = (assessmentId: string, strategy: string) => run(async () => {
    setPath(await api<Path>(`/learning/assessments/${assessmentId}/path`, { method: "POST", body: json({ strategy }) }));
    setOpen(null);
    await load();
  }, "Đang lập lộ trình…");
  const setStep = (stepId: string, status: string) => run(async () => {
    if (!path) return;
    setPath(await api<Path>(`/learning/paths/${path.id}/steps/${stepId}`, { method: "POST", body: json({ status }) }));
    await load();
  });
  const removePath = () => {
    if (!path || !window.confirm(`Xoá lộ trình "${path.summary.title}"? Không khôi phục được. Kết quả các bài đánh giá và mức nắm vững vẫn được giữ.`)) return;
    void run(async () => {
      await api(`/learning/paths/${path.id}`, { method: "DELETE" });
      unpinPrefix(`path:${path.id}:`); // bỏ ghim "Đang ôn" của các bước thuộc lộ trình đã xoá
      setPath(null);
      await load();
    });
  };

  if (open) {
    return (
      <AssessmentPanel a={open} busy={busy} pending={pending} err={err} onClose={() => { setOpen(null); void load(); }}
        onSubmit={(answers) => run(async () => setOpen(await api<Assessment>(`/learning/assessments/${open.id}/submit`, { method: "POST", body: json({ answers }) })),
          open.purpose === "placement" ? "Đang chấm bài và viết nhận xét, lời khuyên…" : "Đang chấm bài…")}
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
      {pending && <div className="mt-3"><Pending text={pending} /></div>}
      {!cur ?<p className={`mt-3 text-sm ${muted}`}>Đang tải…</p> : cur.lessons.length === 0 ? (
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
            <PathPanel path={path} courseId={courseId} busy={busy} onStep={(id, s) => void setStep(id, s)} onDelete={removePath}
              onCheckpoint={(stepId) => void startAssessment({ path_id: path.id, step_id: stepId })}
              onPractice={(action, topic, label, count) => onPractice(courseId, action, topic, label, count)}
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

/** Câu đã chấm: 4 phương án (đúng: xanh ✓; đã chọn sai: đỏ ✗), giải thích + trích dẫn mở trang nguồn. */
function ReviewQuestion({ q, n }: { q: Question; n: number }) {
  const unanswered = q.picked == null;
  return (
    <li className="rounded-lg border border-black/5 dark:border-white/10 p-2.5">
      <p className="font-medium">
        {n}. {q.text}
        {unanswered ? <span className={`ml-1 font-normal ${muted}`}>(chưa trả lời)</span>
          : <span className={`ml-1 ${q.picked === q.correct ? "text-emerald-600" : "text-red-600"}`}>{q.picked === q.correct ? "✓ Đúng" : "✗ Sai"}</span>}
      </p>
      <ul className="mt-1.5 grid gap-1">
        {q.options.map((o, k) => {
          const right = k === q.correct;
          const wrongPick = k === q.picked && !right;
          return (
            <li key={k} className={`rounded-md px-2 py-1 ${right ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : wrongPick ? "bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200" : ""}`}>
              {String.fromCharCode(65 + k)}. {o}{right ? " ✓" : wrongPick ? " ✗ (bạn chọn)" : ""}
            </li>
          );
        })}
      </ul>
      {(q.explanation || q.source) && <p className={`mt-1.5 text-[12px] ${muted}`}>{q.explanation}{q.source && <Refs refs={[q.source]} />}</p>}
    </li>
  );
}

function AssessmentPanel({ a, busy, pending, err, onClose, onSubmit, onChoose }: { a: Assessment; busy: boolean; pending: string | null; err: string | null; onClose: () => void; onSubmit: (answers: Record<string, number>) => void; onChoose: (strategy: string) => void }) {
  const [picked, setPicked] = useState<Record<string, number>>(() =>
    Object.fromEntries(a.questions.filter((q) => q.picked != null).map((q) => [q.id, q.picked as number])));
  const done = a.status === "Submitted";
  const r = a.result;
  const gapOf = new Map((r?.gaps ?? []).map((g) => [g.topic_id, g]));
  const withdrawn = a.questions.filter((q) => q.withdrawn).length;
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
      {pending && <Pending text={pending} />}

      {r && (
        <div className="space-y-3">
          {/* Kết quả theo chủ đề + lỗ hổng GỘP làm một: mỗi chủ đề một dòng (▸ mở chi tiết); chủ đề còn hổng xếp lên đầu */}
          <details open className="group/res rounded-xl border border-black/10 dark:border-white/10">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
              <ChevronRight size={16} className="shrink-0 transition group-open/res:rotate-90" aria-hidden="true" />
              <span className="font-semibold">Kết quả bài làm</span>
              <span className={muted}>· đúng {r.summary.correct}/{r.summary.answered} câu đã trả lời{r.summary.score_pct != null && ` (${r.summary.score_pct}%)`}
                {r.gaps.length > 0 && ` · ${r.gaps.length} chủ đề còn hổng`}</span>
            </summary>
            <ul className="divide-y divide-black/5 border-t border-black/5 dark:divide-white/10 dark:border-white/10">
              {[...r.topics].sort((x, y) => Number(!gapOf.has(x.topic_id)) - Number(!gapOf.has(y.topic_id))).map((t) => {
                const g = gapOf.get(t.topic_id);
                return (
                  <li key={t.topic_id}>
                    <details className="group/t">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
                        <ChevronRight size={14} className={`shrink-0 transition group-open/t:rotate-90 ${muted}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                        <span className={`hidden shrink-0 sm:inline ${muted}`}>{t.lesson_title} · đúng {t.correct}/{t.answered}</span>
                        <Level level={t.level} />
                      </summary>
                      <div className="space-y-1 px-9 pb-3 text-[13px]">
                        {/* câu hỏi + đáp án lên ĐẦU; mục tiêu / vì sao / xem lại ở dưới */}
                        <ol className="mb-2 space-y-2">
                          {a.questions.map((q, i) => q.topic_id === t.topic_id && !q.withdrawn && <ReviewQuestion key={q.id} q={q} n={i + 1} />)}
                        </ol>
                        <p className={muted}>{t.lesson_title} · đúng {t.correct}/{t.answered}{t.confidence === "low" && " · cần thêm câu để chắc chắn"}</p>
                        <ul className="list-disc pl-4">{t.objectives.map((o) => <li key={o.id}>{o.status === "met" ? "✓" : o.status === "not_answered" ? "…" : "✗"} {o.text}</li>)}</ul>
                        {g && <>
                          <p><b>Vì sao:</b> {g.why}</p>
                          {g.evidence.length > 0 && <ul className="list-disc pl-4">{g.evidence.map((e, i) => <li key={i}>Chọn “{e.picked_text}” — {e.indicates}</li>)}</ul>}
                          {g.root_causes.length > 0 && <p><b>Nguyên nhân gốc:</b> chưa vững {g.root_causes.map((x) => `“${x.title}” (${x.lesson_title})`).join(", ")}</p>}
                        </>}
                        {g && (
                          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                            <b>Xem lại:</b> Bài {g.lesson_order}: {g.review.lesson_title}<Refs refs={g.review.sources} bare />
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            {withdrawn > 0 && <p className={`border-t border-black/5 px-3 py-2 text-[12px] dark:border-white/10 ${muted}`}>{withdrawn} câu bị ẩn và không chấm vì nguồn không còn khả dụng.</p>}
          </details>
          {r.review && (
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-3 text-[13px] space-y-1">
              <h3 className="font-semibold">Nhận xét và lời khuyên</h3>
              {r.review.overview && <p>{r.review.overview}</p>}
              {r.review.advice.length > 0 && <ol className="list-decimal pl-5">{r.review.advice.map((x, i) => <li key={i}>{x}</li>)}</ol>}
              {r.review.path_hint && <p><b>Lộ trình:</b> {r.review.path_hint}</p>}
            </div>
          )}
          {!a.path_id && (
            <div>
              <h3 className="font-semibold">{r.path_options.length > 1 ? "Chọn lộ trình" : "Lộ trình phù hợp"}</h3>
              <div className={`mt-2 grid gap-2 ${["", "", "md:grid-cols-2", "md:grid-cols-3"][r.path_options.length] ?? ""}`}>
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

      {/* đang làm bài: danh sách câu để chọn; đã nộp: câu nằm trong từng chủ đề ở "Kết quả bài làm" */}
      {!done && <ol className="space-y-3">
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
                {done && q.explanation && <p className={`mt-1 text-[12px] ${muted}`}>{q.explanation}{q.source && <Refs refs={[q.source]} />}</p>}
              </>
            )}
          </li>
        ))}
      </ol>}
      {!done && (
        <button type="button" className={btn} disabled={busy || Object.keys(picked).length === 0} onClick={() => onSubmit(picked)}>
          {busy ? "Đang chấm…" : `Nộp bài (${Object.keys(picked).length}/${a.questions.length} câu)`}
        </button>
      )}
    </section>
  );
}

/** Lộ trình làm TỪNG BƯỚC: (1) khung các bước để người học xem và xác nhận; (2) xác nhận xong mỗi lần chỉ hiện một
 *  bước, thanh số 1·2·3… + Quay lại / Tiếp theo; trong bước chỉ có ô chọn hình thức ôn tập (không liệt kê mọi hoạt động).
 *  "Đã xác nhận" = có bước khác "chưa bắt đầu" (lưu ở server qua API bước — tải lại trang không phải xác nhận lại). */
function PathPanel({ path, courseId, busy, onStep, onDelete, onCheckpoint, onPractice, onFind }: { path: Path; courseId: string; busy: boolean; onStep: (id: string, status: string) => void; onDelete: () => void; onCheckpoint: (stepId: string) => void; onPractice: (action: string, topic: string, label: string, count?: number) => void; onFind: (query: string) => void }) {
  const steps = path.steps;
  const started = steps.some((x) => x.status !== "not_started");
  const [idx, setIdx] = useState(() => Math.max(0, steps.findIndex((x) => x.id === path.next_step_id)));
  const [explaining, setExplaining] = useState(false);
  // D-83: bấm ôn một bước → ghim bước đó thành tag "Đang ôn" (đổi qua lại giữa các phần, kể cả khi đang trong chat)
  const pin = (s: Step) => pinStudy({
    key: `path:${path.id}:${s.id}`, source: "path", title: s.title, subtitle: path.summary.title, courseId,
    topic: `${s.title}. ${s.objectives.join("; ")}`.slice(0, 600), concepts: s.concepts,
    actions: s.activities.filter((x) => x.type === "find" || CHAT_ACTIONS.has(x.type)),
    href: `/learning/plans?tab=progress&step=${encodeURIComponent(s.id)}`,
  });
  // mở từ tag "Đang ôn" (?step=) → đúng bước đó
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("step");
    const k = id ? steps.findIndex((x) => x.id === id) : -1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc URL sau hydrate (server không có window)
    if (k >= 0) setIdx(k);
    // chỉ khi đổi lộ trình — không nhảy lại mỗi lần tải lại bước
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.id]);

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-medium">{path.summary.title} <span className={`font-normal ${muted}`}>· {path.done}/{path.total} bước · ~{path.summary.total_minutes} phút</span></p>
        <p className={`text-[12px] ${muted}`}>{path.summary.description}</p>
      </div>
      <button type="button" className={`${btn2} shrink-0 text-red-600`} disabled={busy} onClick={onDelete}>🗑 Xoá</button>
    </div>
  );
  const kindOf = (x: Step) => (x.remediation ? "Ôn lại" : STEP_KIND[x.kind] ?? x.kind);

  if (!started) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
        {header}
        <p className="mt-3 text-[13px] font-medium">Khung lộ trình — {steps.length} bước. Xem qua rồi xác nhận để bắt đầu làm từng bước:</p>
        <p className={`mt-1 text-[12px] ${muted}`}>Cách đi: ôn tập → kiểm tra → đạt ≥ {PASS_PCT}% mới mở bài mới (đạt thì phần ôn tập trước đó được tính là xong); chưa đạt thì ôn lại rồi kiểm tra lại. Sang bài mới vẫn quay lại được bài cũ.</p>
        <ol className="mt-2 space-y-1 text-[13px]">
          {steps.map((x) => (
            <li key={x.id} className="flex gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black/5 dark:bg-white/10 text-[11px]">{x.order}</span>
              <span><span className={muted}>[{kindOf(x)}]</span> {x.title} <span className={muted}>· ~{x.minutes} phút</span></span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy || !steps.length} onClick={() => { setIdx(0); onStep(steps[0].id, "in_progress"); }}>Xác nhận, bắt đầu bước 1</button>
          <button type="button" className={btn2} disabled={busy} onClick={onDelete}>Chọn lộ trình khác</button>
        </div>
      </div>
    );
  }

  const i = Math.min(idx, steps.length - 1);
  const s = steps[i];
  const last = i === steps.length - 1;
  const context = `${s.title}. ${s.objectives.join("; ")}`.slice(0, 600);
  const topics = (s.topic_titles ?? []).join(", ") || s.title;
  const failed = s.kind === "checkpoint" && s.status === "done" && s.result && !s.result.passed;
  // bài kiểm tra: phải làm xong mới đi tiếp; bước bị khóa: chưa đi tiếp được; bước nguồn đã thu hồi: cho bỏ qua
  const canNext = s.needs_update || (s.kind === "checkpoint" ? s.status === "done" : !s.locked);
  const go = (k: number) => { setIdx(k); setExplaining(false); };
  const next = () => {
    if (!s.needs_update && s.kind !== "checkpoint" && s.status !== "done") onStep(s.id, "done"); // làm xong bước này
    if (!last) go(i + 1);
  };

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
      {header}
      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Các bước của lộ trình">
        {steps.map((x, k) => (
          <li key={x.id}>
            <button type="button" title={`${k + 1}. ${x.title}`} aria-current={k === i ? "step" : undefined} onClick={() => go(k)}
              className={`grid h-7 w-7 place-items-center rounded-full border-0 text-[12px] cursor-pointer ${k === i ? "bg-black text-white dark:bg-white dark:text-black"
                : x.status === "done" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : x.locked ? "bg-black/5 dark:bg-white/10 opacity-50" : "bg-black/5 dark:bg-white/10"}`}>
              {x.status === "done" && k !== i ? "✓" : k + 1}
            </button>
          </li>
        ))}
      </ol>

      <div id={`step-${s.id}`} className={`mt-3 rounded-lg bg-black/[0.03] dark:bg-white/5 p-3 text-[13px] ${s.remediation || s.round ? "border-l-2 border-amber-500" : ""}`}>
        <p className={`text-[12px] ${muted}`}>Bước {i + 1}/{steps.length} · {kindOf(s)} · ~{s.minutes} phút</p>
        <p className="mt-0.5 text-[14px] font-semibold">{s.title}{s.status === "done" && " ✓"}
          {s.result && <span className="font-normal"> · {s.result.score_pct ?? "—"}% {s.result.passed ? "(đạt)" : "(chưa đạt)"}</span>}</p>
        {failed && <p className="mt-1 text-amber-700 dark:text-amber-300">Chưa đạt — sang các bước “Ôn lại” tiếp theo rồi kiểm tra lại; đạt mới mở bài mới.</p>}
        {s.needs_update ? <p className={`mt-1 ${muted}`}>Nguồn của bước này không còn khả dụng — có thể bỏ qua.</p> : (
          <>
            {s.objectives.length > 0 && s.kind !== "checkpoint" && <p className={`mt-1 ${muted}`}>Mục tiêu: {s.objectives.slice(0, 3).join("; ")}</p>}
            {s.sources.length > 0 && <p className={muted}>Đọc<Refs refs={s.sources} /></p>}
            {s.locked ? <p className="mt-2 text-amber-700 dark:text-amber-300">🔒 {s.unlock}</p>
              : s.kind === "checkpoint" ? (
                s.status !== "done" && (
                  <>
                    <p className={`mt-1 ${muted}`}>Đạt ≥ {PASS_PCT}% thì coi như đã qua phần ôn tập trước đó và mở bước tiếp theo; chưa đạt sẽ có các bước ôn lại rồi kiểm tra lại.</p>
                    <button type="button" className={`${btn} mt-2`} disabled={busy} onClick={() => onCheckpoint(s.id)}>Làm bài kiểm tra</button>
                  </>
                )
              ) : (
                <>
                  <PracticePicker key={s.id} busy={busy} onPick={(c) => { pin(s); onPractice(c.action, context, FORMAT_LABEL[c.action], c.count); }} />
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button type="button" className={btn2} onClick={() => { pin(s); onFind(topics); }}>🔎 Tìm tài liệu học</button>
                    <button type="button" className={btn2} aria-expanded={explaining}
                      onClick={() => (s.concepts?.length ? setExplaining(!explaining) : (pin(s), onPractice("explain", context, "Nhờ giải thích")))}>
                      💬 Nhờ giải thích{s.concepts?.length ? (explaining ? " ▴" : " ▾") : ""}
                    </button>
                  </div>
                  {explaining && !!s.concepts?.length && (
                    <div className="mt-2 rounded-lg border border-black/10 dark:border-white/10 p-2">
                      <p className={`text-[12px] ${muted}`}>Chọn khái niệm bạn muốn trợ lý giải thích từng bước:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.concepts.map((c) => (
                          <button key={c} type="button" className={btn2} onClick={() => { setExplaining(false); pin(s); onPractice("explain", `${c} (chủ đề: ${topics})`.slice(0, 600), `Giải thích: ${c}`); }}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" className={btn2} disabled={i === 0} onClick={() => go(i - 1)}>← Quay lại</button>
        {!canNext && <span className={`text-[12px] ${muted}`}>{s.kind === "checkpoint" ? "Làm bài kiểm tra để sang bước tiếp theo" : "Bước này chưa mở"}</span>}
        <button type="button" className={btn} disabled={busy || !canNext || (last && s.status === "done")} onClick={next}>
          {last ? (s.status === "done" ? "Đã hoàn thành lộ trình" : "Hoàn thành lộ trình") : "Tiếp theo →"}
        </button>
      </div>
    </div>
  );
}
