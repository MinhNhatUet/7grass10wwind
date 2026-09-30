"use client";

// Trung tâm học của sinh viên (FR-03 + D-37/D-38): tạo nhanh, lộ trình của tôi (tiến độ, ôn tập theo ngày, Google Calendar),
// đề giảng viên giao (làm bài có giờ, chấm ở server), lịch sử bài tự kiểm tra. Chỉ dữ liệu của chính người dùng.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardList, Sparkles, Timer } from "lucide-react";
import { ApiError, api, json, type ChatMessage, type CourseItem, type Plan } from "@/lib/api";
import { LEVEL_LABEL, MSG, errorMessage } from "@/lib/messages";
import { FORMAT_LABEL, PlanCard, PracticePicker, type PracticeChoice } from "@/components/learning-cards";

type PlanRow = { id: string; goal: string; status: string; version: number; done: number; total: number; updated_at: string };
type SelfCheck = { message_id: string; conversation_id: string; kind: string; topic: string | null; questions: number; answered: number; assessed: boolean; levels: string[]; created_at: string };
type QuizRow = { id: string; course_id: string; title: string; kind: string; time_limit_s: number | null; question_count: number; attempts: number; best_score: number | null; best_total: number | null };
type Attempt = { attempt_id: string; deadline: string | null; server_now: string; quiz: { id: string; title: string; kind: string; questions: { id: string; text: string; options: string[] }[] } };
type Result = { score: number; total: number; late: boolean; kind: string; review?: { id: string; correct: number; picked?: number; explanation: string }[] };

const card = "rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#12181f] p-5";
const btn = "rounded-full px-4 py-1.5 text-[13px] font-medium cursor-pointer border-0 bg-black text-white dark:bg-white dark:text-black hover:opacity-80 disabled:opacity-40";
const btn2 = "rounded-full px-3 py-1.5 text-[13px] cursor-pointer border border-black/10 dark:border-white/15 bg-transparent hover:bg-black/5 dark:hover:bg-white/10";
const muted = "text-black/50 dark:text-white/50";
const KIND: Record<string, string> = { practice: "Luyện tập", exam: "Kiểm tra", midterm: "Giữa kỳ", final: "Cuối kỳ" };
const PLAN_STATUS: Record<string, string> = { Draft: "Nháp", Confirmed: "Đã xác nhận", InProgress: "Đang học", Paused: "Tạm dừng", Completed: "Hoàn thành", Cancelled: "Đã hủy" };
const errText = (e: unknown) => (e instanceof ApiError ? e.detail || errorMessage(e.code) : MSG.serviceError);

const QUICK = [
  { label: "Lập lộ trình học", q: "Lập lộ trình học … trong 7 ngày, mỗi ngày 45 phút" },
  { label: "Tự kiểm tra một chủ đề", q: "Cho tôi câu hỏi tự kiểm tra về " },
  { label: "Chẩn đoán kiến thức nền", q: "Tôi mới học, không biết bắt đầu từ đâu — kiểm tra nhanh kiến thức nền giúp mình" },
  { label: "Flashcard", q: "Tạo flashcard về " },
  { label: "Cấp cứu sát giờ thi", q: "Mai thi phần …, ôn cấp tốc giúp mình" },
];

export function LearningHub({ courses }: { courses: CourseItem[] }) {
  const router = useRouter();
  const [checks, setChecks] = useState<SelfCheck[] | null>(null);
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [taking, setTaking] = useState<Attempt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const names = new Map(courses.map((c) => [c.id, c.name]));

  const load = useCallback(async () => {
    try {
      setChecks((await api<{ items: SelfCheck[] }>("/learning/self-checks")).items);
      const qs = await Promise.all(courses.map((c) => api<{ items: QuizRow[] }>(`/course-quizzes?course_id=${encodeURIComponent(c.id)}`)));
      setQuizzes(qs.flatMap((r) => r.items));
    } catch (e) {
      setErr(errText(e));
    }
  }, [courses]);

  // load() chỉ setState sau await (dữ liệu từ server) — không phải setState đồng bộ trong effect
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Ôn tập từ trang này: tạo hội thoại mới (cố định môn nếu đã chọn), gửi yêu cầu ôn tập rồi mở chat ở hội thoại đó
  async function practiceInChat(content: string, body: Record<string, unknown>, courseId?: string) {
    setWorking("Đang tạo bài ôn tập… (có thể mất 10–30 giây)");
    try {
      router.push(`/?conv=${encodeURIComponent((await startLearningChat(body, courseId)).conversationId)}`);
    } catch (e) {
      setErr(errText(e));
      setWorking(null);
    }
    void content;
  }

  async function startQuiz(id: string) {
    setErr(null);
    try {
      setTaking(await api<Attempt>(`/course-quizzes/${id}/attempts`, { method: "POST" }));
    } catch (e) {
      setErr(errText(e));
    }
  }

  if (taking) return <TakeQuiz attempt={taking} onExit={() => { setTaking(null); void load(); }} />;

  return (
    <div className="space-y-6">
      {err && <p className="rounded-xl bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-200">{err}</p>}
      {working && <p role="status" className="rounded-xl bg-blue-50 dark:bg-blue-950 px-4 py-2 text-sm">{working}</p>}

      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={18} /> Bắt đầu nhanh</h2>
        <p className={`mt-1 text-sm ${muted}`}>Mở chat với câu mẫu — trợ lý học tập trả lời kèm nguồn từ tài liệu môn học.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((x) => (
            <button key={x.label} type="button" className={btn2} onClick={() => router.push(`/?q=${encodeURIComponent(x.q)}`)}>{x.label}</button>
          ))}
        </div>
      </section>

      <TopicPractice courses={courses} busy={!!working}
        onStart={(courseId, topic, c, label) => {
          const content = `Ôn tập ${label} — ${FORMAT_LABEL[c.action]}, ${c.count} câu`;
          void practiceInChat(content, { content, assistant: "learning", learning: { action: c.action, count: c.count, topic } }, courseId);
        }} />

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><CalendarDays size={18} /> Lộ trình học</h2>
            <p className={`mt-1 text-sm ${muted}`}>Tạo lộ trình theo mục tiêu, theo dõi tiến độ, ôn tập từng buổi và đưa lịch vào Google Calendar.</p>
          </div>
          <Link href="/learning/plans" className={`${btn} no-underline`}>Mở lộ trình học →</Link>
        </div>
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><ClipboardList size={18} /> Đề giảng viên giao</h2>
        {quizzes === null ? <p className={`mt-2 text-sm ${muted}`}>Đang tải…</p> : quizzes.length === 0 ? (
          <p className={`mt-2 text-sm ${muted}`}>Chưa có đề nào được phát hành cho các môn của bạn.</p>
        ) : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {quizzes.map((q) => {
              const once = q.kind !== "practice" && q.attempts > 0;
              return (
                <li key={q.id} className="rounded-xl border border-black/5 dark:border-white/10 p-3">
                  <p className="font-medium">{q.title}</p>
                  <p className={`text-[12px] ${muted}`}>
                    {names.get(q.course_id) ?? q.course_id} · {KIND[q.kind] ?? q.kind} · {q.question_count} câu
                    {q.time_limit_s ? ` · ${Math.round(q.time_limit_s / 60)} phút` : " · không giới hạn giờ"}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px]">{q.best_score !== null ? `Điểm cao nhất: ${q.best_score}/${q.best_total}` : "Chưa làm"}</span>
                    <button type="button" className={btn} disabled={once} onClick={() => void startQuiz(q.id)}>
                      {once ? "Đã nộp" : q.attempts ? "Làm lại" : "Làm bài"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><BookOpen size={18} /> Bài tự kiểm tra của tôi</h2>
        {checks === null ? <p className={`mt-2 text-sm ${muted}`}>Đang tải…</p> : checks.length === 0 ? (
          <p className={`mt-2 text-sm ${muted}`}>Chưa có bài tự kiểm tra. Bấm &quot;Tự kiểm tra một chủ đề&quot; ở trên.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10">
            {checks.map((c) => (
              <li key={c.message_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.kind === "diagnose" ? "Chẩn đoán" : "Tự kiểm tra"}: {c.topic ?? "—"}</p>
                  <p className={`text-[12px] ${muted}`}>
                    {c.assessed ? `Đã đánh giá: ${c.levels.map((l) => LEVEL_LABEL[l] ?? l).join(", ")}` : `Đã làm ${c.answered}/${c.questions} câu`}
                    {" · "}{new Date(c.created_at).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <button type="button" className={btn2} onClick={() => router.push(`/?conv=${encodeURIComponent(c.conversation_id)}`)}>
                  {c.assessed ? "Xem lại" : "Làm tiếp"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Tạo hội thoại mới (cố định môn nếu có) và gửi yêu cầu học tập; trả về id hội thoại để mở chat. */
export async function startLearningChat(body: Record<string, unknown>, courseId?: string) {
  const conv = await api<{ conversation_id: string }>("/conversations", { method: "POST", body: json(courseId ? { course_id: courseId } : {}) });
  const msg = await api<ChatMessage>(`/conversations/${conv.conversation_id}/messages`, { method: "POST", body: json(body) });
  return { conversationId: conv.conversation_id, message: msg };
}

/** Lộ trình của tôi (trang /learning/plans): danh sách từ server; mở ra là PlanCard (tiến độ, ôn tập theo ngày, Google Calendar). */
export function MyPlans({ reloadKey = 0, openId }: { reloadKey?: number; openId?: string | null }) {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setPlans((await api<{ items: PlanRow[] }>("/learning/plans")).items);
    } catch (e) {
      setErr(errText(e));
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- setState chỉ sau await
  useEffect(() => { void load(); }, [load, reloadKey]);
  useEffect(() => {
    if (openId) api<Plan>(`/learning/plans/${openId}`).then(setOpenPlan).catch((e) => setErr(errText(e)));
  }, [openId]);

  async function showPlan(id: string) {
    if (openPlan?.id === id) return setOpenPlan(null);
    try {
      setOpenPlan(await api<Plan>(`/learning/plans/${id}`));
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function practice(body: Record<string, unknown>) {
    setWorking("Đang tạo bài ôn tập… (có thể mất 10–30 giây)");
    try {
      router.push(`/?conv=${encodeURIComponent((await startLearningChat(body)).conversationId)}`);
    } catch (e) {
      setErr(errText(e));
      setWorking(null);
    }
  }

  const shown = (plans ?? []).filter((p) => (!status || p.status === status) && p.goal.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><CalendarDays size={18} /> Lộ trình của bạn ({plans?.length ?? 0})</h2>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm lộ trình…" aria-label="Tìm lộ trình"
            className="w-[200px] rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-1.5 text-sm outline-none" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái"
            className="rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-1.5 text-sm">
            <option value="">Tất cả trạng thái</option>
            {Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {err && <p className="mt-3 rounded-xl bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-200">{err}</p>}
      {working && <p role="status" className="mt-3 rounded-xl bg-blue-50 dark:bg-blue-950 px-4 py-2 text-sm">{working}</p>}
      {plans === null ? <p className={`mt-3 text-sm ${muted}`}>Đang tải…</p> : plans.length === 0 ? (
        <p className={`mt-3 text-sm ${muted}`}>Bạn chưa có lộ trình nào. Bấm &quot;Tạo lộ trình mới&quot; để AI lập kế hoạch từ tài liệu môn học.</p>
      ) : shown.length === 0 ? (
        <p className={`mt-3 text-sm ${muted}`}>Không có lộ trình nào khớp bộ lọc.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => void showPlan(p.id)} className="w-full text-left rounded-xl border border-black/5 dark:border-white/10 p-3 bg-transparent cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{p.goal}</span>
                  <span className={`shrink-0 text-[12px] ${muted}`}>{PLAN_STATUS[p.status] ?? p.status} · v{p.version}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-black dark:bg-white" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                </div>
                <span className={`mt-1 block text-[12px] ${muted}`}>Đã xong {p.done}/{p.total} buổi</span>
              </button>
              {openPlan?.id === p.id && (
                <PlanCard
                  meta={{ plan: openPlan } as ChatMessage["metadata"]}
                  onChanged={() => { void load(); void api<Plan>(`/learning/plans/${p.id}`).then(setOpenPlan); }}
                  onDeleted={() => { setOpenPlan(null); void load(); }}
                  onSend={(_content, body) => void practice(body)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Chapter = { chapter: string; title: string; document: string; page: number | null; sections: string[] };

/** Ôn tập theo CHƯƠNG (D-44): mục lục tài liệu → chương lớn kèm các mục con; câu hỏi trải khắp chương. */
function TopicPractice({ courses, busy, onStart }: { courses: CourseItem[]; busy: boolean; onStart: (courseId: string, topic: string, c: PracticeChoice, label: string) => void }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [text, setText] = useState(""); // vừa là ô lọc, vừa là chủ đề tự gõ
  const [picked, setPicked] = useState<Chapter | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    // Chương của các tài liệu trong môn mà user được đọc (server lọc quyền)
    api<{ items: Chapter[] }>(`/learning/topics?course_id=${encodeURIComponent(courseId)}`)
      .then((r) => alive && setChapters(r.items))
      .catch(() => alive && setChapters([]));
    return () => { alive = false; };
  }, [courseId]);

  const q = text.trim().toLowerCase();
  const shown = (chapters ?? []).filter((c) => !q || `${c.title} ${c.sections.join(" ")}`.toLowerCase().includes(q));
  const byDoc = shown.reduce<Record<string, Chapter[]>>((acc, c) => ((acc[c.document] ||= []).push(c), acc), {});
  const label = picked ? `Chương ${picked.chapter}: ${picked.title}` : text.trim();
  const topic = picked
    ? `Chương ${picked.chapter} "${picked.title}" (${picked.document})${picked.sections.length ? ` — gồm các mục: ${picked.sections.join("; ")}` : ""}. Câu hỏi trải đều các mục của chương.`
    : text.trim();

  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 font-semibold"><ClipboardList size={18} /> Ôn tập theo chương</h2>
      <p className={`mt-1 text-sm ${muted}`}>Chọn môn, chọn một chương (gõ để lọc theo tên chương hoặc mục bên trong) hoặc tự gõ chủ đề, rồi chọn hình thức và số câu.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={courseId} aria-label="Môn"
          onChange={(e) => { if (e.target.value === courseId) return; setCourseId(e.target.value); setChapters(null); setPicked(null); setText(""); }}
          className="rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm">
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={picked ? label : text} aria-label="Lọc hoặc gõ chủ đề"
          onChange={(e) => { setPicked(null); setText(e.target.value); }}
          placeholder="Lọc chương (vd. graph, prime, hamilton…) hoặc gõ chủ đề của bạn"
          className="min-w-[260px] flex-1 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm outline-none" />
        {picked && <button type="button" className={btn2} onClick={() => { setPicked(null); setText(""); }}>Bỏ chọn</button>}
      </div>

      {picked ? (
        picked.sections.length > 0 && (
          <p className={`mt-2 text-[12px] ${muted}`}>{picked.document} · gồm {picked.sections.length} mục: {picked.sections.join(" · ")}</p>
        )
      ) : (
        <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-black/5 dark:border-white/10 p-2">
          {chapters === null ? (
            <p className={`p-2 text-sm ${muted}`}>Đang lấy danh sách chương…</p>
          ) : chapters.length === 0 ? (
            <p className={`p-2 text-sm ${muted}`}>Môn này chưa có tài liệu đã phát hành — bạn vẫn có thể tự gõ chủ đề.</p>
          ) : shown.length === 0 ? (
            <p className={`p-2 text-sm ${muted}`}>Không có chương nào khớp “{text}”. Bạn có thể ôn tập đúng chủ đề vừa gõ.</p>
          ) : (
            Object.entries(byDoc).map(([doc, list]) => (
              <div key={doc} className="mb-3">
                <p className={`px-2 py-1 text-[12px] font-semibold uppercase tracking-wide ${muted}`}>{doc} · {list.length} chương</p>
                <div className="grid gap-2 px-1 sm:grid-cols-2">
                  {list.map((c) => (
                    <button key={`${doc}-${c.chapter}`} type="button" onClick={() => setPicked(c)} title={c.page ? `Bắt đầu ở trang ${c.page}` : undefined}
                      className="rounded-xl border border-black/10 dark:border-white/15 bg-transparent p-3 text-left cursor-pointer hover:border-[#4f2b96] hover:bg-[#f5f3ff] dark:hover:bg-white/10">
                      <span className="block text-[14px] font-medium"><span className={muted}>Chương {c.chapter} · </span>{c.title}</span>
                      {c.sections.length > 0 && (
                        <span className={`mt-1 block text-[12px] ${muted}`}>
                          {c.sections.slice(0, 4).join(" · ")}{c.sections.length > 4 ? ` · +${c.sections.length - 4} mục` : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {topic ? (
        <PracticePicker busy={busy} onPick={(c) => onStart(courseId, topic, c, label)} />
      ) : (
        <p className={`mt-2 text-[12px] ${muted}`}>Chọn một chương hoặc gõ chủ đề để chọn hình thức ôn tập.</p>
      )}
    </section>
  );
}

function TakeQuiz({ attempt, onExit }: { attempt: Attempt; onExit: () => void }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Đồng hồ theo giờ server (bù lệch giờ máy); hết giờ tự nộp — server vẫn là nơi quyết định "muộn"
  const skew = useRef(0);
  const [left, setLeft] = useState<number | null>(null);
  const submitted = useRef(false);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      setResult(await api<Result>(`/quiz-attempts/${attempt.attempt_id}/submit`, { method: "POST", body: json({ answers: picked }) }));
    } catch (e) {
      submitted.current = false;
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }, [attempt.attempt_id, picked]);

  useEffect(() => {
    if (!attempt.deadline || result) return;
    const end = new Date(attempt.deadline).getTime();
    skew.current = Date.now() - new Date(attempt.server_now).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - (Date.now() - skew.current)) / 1000));
      setLeft(s);
      if (s === 0) void submit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [attempt.deadline, attempt.server_now, result, submit]);

  const qs = attempt.quiz.questions;
  const review = new Map((result?.review ?? []).map((r) => [r.id, r]));
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10`}>
        <div>
          <p className="font-semibold">{attempt.quiz.title}</p>
          <p className={`text-[12px] ${muted}`}>{KIND[attempt.quiz.kind] ?? attempt.quiz.kind} · {qs.length} câu · đã chọn {Object.keys(picked).length}/{qs.length}</p>
        </div>
        {left !== null && !result && (
          <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${left < 60 ? "bg-red-50 text-red-700" : "bg-black/5 dark:bg-white/10"}`}>
            <Timer size={16} /> {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        )}
        {result ? (
          <button type="button" className={btn} onClick={onExit}>Quay lại</button>
        ) : (
          <div className="flex gap-2">
            <button type="button" className={btn2} onClick={() => { if (confirm("Thoát? Bài chưa nộp — thời gian vẫn tính.")) onExit(); }}>Thoát</button>
            <button type="button" className={btn} disabled={busy} onClick={() => { if (confirm("Nộp bài?")) void submit(); }}>{busy ? "Đang nộp…" : "Nộp bài"}</button>
          </div>
        )}
      </div>

      {err && <p className="rounded-xl bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-200">{err}</p>}
      {result && (
        <div className={`${card} text-center`}>
          <p className="text-3xl font-bold">{result.score}/{result.total}</p>
          <p className={`mt-1 text-sm ${muted}`}>
            {result.late ? "Nộp sau khi hết giờ. " : ""}
            {result.kind === "practice" ? "Đáp án và giải thích hiện ở từng câu bên dưới." : "Đề kiểm tra/thi: chỉ hiện điểm, không công bố đáp án."}
          </p>
        </div>
      )}

      {qs.map((q, i) => {
        const r = review.get(q.id);
        return (
          <div key={q.id} className={card}>
            <p className="font-medium">Câu {i + 1}. {q.text}</p>
            <div className="mt-3 grid gap-2">
              {q.options.map((o, k) => {
                const chosen = picked[q.id] === k;
                const tone = r ? (r.correct === k ? "border-green-500 bg-green-50 dark:bg-green-950/40" : chosen ? "border-red-400 bg-red-50 dark:bg-red-950/40" : "border-black/10 dark:border-white/10")
                  : chosen ? "border-[#4f2b96] bg-[#f5f3ff] dark:bg-white/10" : "border-black/10 dark:border-white/10";
                return (
                  <button key={k} type="button" disabled={!!result} onClick={() => setPicked({ ...picked, [q.id]: k })}
                    className={`flex items-center gap-3 rounded-xl border-2 p-2 text-left cursor-pointer bg-transparent disabled:cursor-default ${tone}`}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black/5 dark:bg-white/10 text-sm font-bold">{"ABCD"[k]}</span>
                    {o}
                  </button>
                );
              })}
            </div>
            {r?.explanation && <p className={`mt-2 text-sm ${muted}`}>Giải thích: {r.explanation}</p>}
          </div>
        );
      })}
    </div>
  );
}
