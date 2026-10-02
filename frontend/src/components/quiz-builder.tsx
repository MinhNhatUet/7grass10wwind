"use client";

// Quiz Builder cho giảng viên/người duyệt (D-38): giữ bố cục mockup của TV4 (3 cột: danh sách câu · soạn câu · cài đặt)
// nhưng nối API thật. Quyền do server quyết định (chỉ môn phụ trách); đáp án chỉ người phụ trách thấy.

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Copy, FileUp, HelpCircle, Info, Plus, Trash2 } from "lucide-react";
import { ApiError, api, json, type CourseItem } from "@/lib/api";
import { MSG, errorMessage } from "@/lib/messages";

type Q = { id?: string; text: string; options: string[]; correct: number | null; explanation: string };
type Quiz = {
  id: string; course_id: string; title: string; kind: string; time_limit_s: number | null; status: string;
  question_count: number; questions: Q[];
};
type Results = {
  attempts: { student: string; score: number; total: number; late: boolean; submitted_at: string }[];
  correct_rate: Record<string, number | null>;
};

const KIND: Record<string, string> = { practice: "Luyện tập", exam: "Kiểm tra", midterm: "Giữa kỳ", final: "Cuối kỳ" };
const STATUS: Record<string, string> = { Draft: "Nháp", Published: "Đã phát hành", Closed: "Đã đóng" };
const TIMES: [string, number | null][] = [
  ["Không giới hạn", null], ["5 phút", 300], ["10 phút", 600], ["15 phút", 900], ["20 phút", 1200], ["30 phút", 1800],
  ["45 phút", 2700], ["60 phút", 3600], ["90 phút", 5400], ["120 phút", 7200],
];
const emptyQ = (): Q => ({ text: "", options: ["", "", "", ""], correct: null, explanation: "" });
const complete = (q: Q) => !!q.text.trim() && q.options.every((o) => o.trim()) && q.correct !== null;
const card = "bg-white dark:bg-[#12181f] rounded-2xl shadow-sm border border-slate-100 dark:border-white/10";
const errText = (e: unknown) => (e instanceof ApiError ? e.detail || errorMessage(e.code) : MSG.serviceError);
const GEN_COUNTS = [5, 10, 15, 20, 30, 40, 50];

/** Nút chọn file PDF (input ẩn); chọn xong gọi onFile và xoá giá trị để chọn lại cùng file được. */
function PdfButton({ busy, label, onFile, className }: { busy: boolean; label: string; onFile: (f: File) => void; className: string }) {
  return (
    <label className={`inline-flex items-center justify-center gap-1.5 cursor-pointer ${busy ? "pointer-events-none opacity-40" : ""} ${className}`}>
      <FileUp size={16} /> {busy ? "Đang xử lý…" : label}
      <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

export function QuizBuilder({ courses }: { courses: CourseItem[] }) {
  const managed = courses.filter((c) => c.can_upload || c.can_review);
  const [courseId, setCourseId] = useState(managed[0]?.id ?? "");
  const [list, setList] = useState<Quiz[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [genCount, setGenCount] = useState(10);

  const loadList = useCallback(async () => {
    if (!courseId) return;
    try {
      setList((await api<{ items: Quiz[] }>(`/course-quizzes?course_id=${encodeURIComponent(courseId)}`)).items);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  }, [courseId]);

  useEffect(() => {
    // loadList() chỉ setState sau await (dữ liệu từ server) — không phải setState đồng bộ trong effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  async function open(id: string) {
    if (dirty && !confirm("Bỏ các thay đổi chưa lưu?")) return;
    setMsg(null);
    setResults(null);
    try {
      const q = await api<Quiz>(`/course-quizzes/${id}`);
      setQuiz({ ...q, questions: q.questions.length ? q.questions : [emptyQ()] });
      setActive(0);
      setDirty(false);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  }

  async function createNew() {
    if (dirty && !confirm("Bỏ các thay đổi chưa lưu?")) return;
    setBusy(true);
    try {
      const q = await api<Quiz>("/course-quizzes", {
        method: "POST",
        body: json({ course_id: courseId, title: "Đề mới", kind: "practice", time_limit_s: null, questions: [] }),
      });
      await loadList();
      setQuiz({ ...q, questions: [emptyQ()] });
      setActive(0);
      setDirty(false);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  const draft = quiz?.status === "Draft";
  const edit = (patch: Partial<Quiz>) => { if (quiz && draft) { setQuiz({ ...quiz, ...patch }); setDirty(true); } };
  const editQ = (i: number, patch: Partial<Q>) =>
    quiz && edit({ questions: quiz.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) });

  async function save(): Promise<boolean> {
    if (!quiz) return false;
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api<Quiz>(`/course-quizzes/${quiz.id}`, {
        method: "PUT",
        body: json({ title: quiz.title, kind: quiz.kind, time_limit_s: quiz.time_limit_s, questions: quiz.questions }),
      });
      setQuiz({ ...saved, questions: saved.questions.length ? saved.questions : [emptyQ()] });
      setDirty(false);
      setMsg({ ok: true, text: "Đã lưu." });
      void loadList();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    if (!quiz) return;
    if (dirty && !(await save())) return;
    setBusy(true);
    setMsg(null);
    try {
      const q = await api<Quiz>(`/course-quizzes/${quiz.id}/status`, { method: "POST", body: json({ status }) });
      setQuiz({ ...q, questions: q.questions.length ? q.questions : [emptyQ()] });
      setMsg({ ok: true, text: `Đã chuyển sang: ${STATUS[q.status] ?? q.status}.` });
      void loadList();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!quiz || !confirm(`Xóa đề "${quiz.title}"?`)) return;
    try {
      await api(`/course-quizzes/${quiz.id}`, { method: "DELETE" });
      setQuiz(null);
      setDirty(false);
      void loadList();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  }

  /** Tải PDF (đề có sẵn hoặc tài liệu) → LLM tạo câu A–D vào đề Nháp. Không truyền quizId → tạo đề mới theo tên file. */
  async function fromPdf(file: File, quizId?: string) {
    if (dirty && !confirm("Bỏ các thay đổi chưa lưu?")) return;
    setBusy(true);
    setMsg({ ok: true, text: `Đang đọc “${file.name}” và tạo câu hỏi… (có thể mất 30–60 giây)` });
    try {
      let id = quizId;
      if (!id) {
        const title = file.name.replace(/\.pdf$/i, "").slice(0, 300) || "Đề từ PDF";
        id = (await api<Quiz>("/course-quizzes", {
          method: "POST",
          body: json({ course_id: courseId, title, kind: "practice", time_limit_s: null, questions: [] }),
        })).id;
      }
      const body = new FormData();
      body.set("file", file);
      body.set("count", String(genCount));
      const q = await api<Quiz & { added: number }>(`/course-quizzes/${id}/generate`, { method: "POST", body });
      setQuiz({ ...q, questions: q.questions.length ? q.questions : [emptyQ()] });
      setActive(Math.max(0, q.questions.length - q.added));
      setDirty(false);
      setResults(null);
      const noKey = q.questions.filter((x) => x.correct === null).length;
      setMsg({ ok: true, text: `Đã thêm ${q.added} câu. Kiểm tra lại nội dung và đáp án trước khi phát hành${noKey ? ` — ${noKey} câu chưa có đáp án đúng` : ""}.` });
      void loadList();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      void loadList();
    } finally {
      setBusy(false);
    }
  }

  async function showResults() {
    if (!quiz) return;
    try {
      setResults(await api<Results>(`/course-quizzes/${quiz.id}/results`));
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  }

  if (!managed.length) {
    return <p className={`${card} p-6 text-slate-500`}>Bạn chưa được phân công phụ trách môn nào để soạn đề.</p>;
  }

  const q = quiz?.questions[active];
  return (
    <div className="space-y-4">
      {/* Thanh chọn môn + đề */}
      <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
        <div className="relative">
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setQuiz(null); setResults(null); }} aria-label="Môn"
            className="appearance-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 py-2 pl-3 pr-9 text-sm">
            {managed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {list.map((x) => (
            <button key={x.id} type="button" onClick={() => void open(x.id)}
              className={`rounded-full px-3 py-1.5 text-[13px] border-2 cursor-pointer ${quiz?.id === x.id ? "border-[#4f2b96] text-[#4f2b96] bg-[#f5f3ff] dark:bg-white/5" : "border-transparent bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/70 hover:bg-slate-100"}`}>
              {x.title} · {STATUS[x.status]} · {x.question_count} câu
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PdfButton busy={busy} label="Tạo đề từ PDF" onFile={(f) => void fromPdf(f)}
            className="rounded-full bg-[#4f2b96] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90" />
          <button type="button" disabled={busy} onClick={() => void createNew()}
            className="rounded-full border-2 border-[#4f2b96] px-4 py-1.5 text-sm font-semibold text-[#4f2b96] hover:bg-[#f5f3ff] cursor-pointer bg-transparent flex items-center gap-1">
            <Plus size={16} /> Đề trống
          </button>
        </div>
      </div>

      {msg && <p className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200"}`}>{msg.text}</p>}

      {!quiz ? (
        <div className={`${card} p-10 text-center text-slate-500 space-y-2`}>
          <FileUp size={32} className="mx-auto text-[#4f2b96]" />
          <p>Bấm <strong>Tạo đề từ PDF</strong>: tải lên đề có sẵn (AI chép câu hỏi và đáp án) hoặc tài liệu học (AI soạn câu hỏi từ nội dung).</p>
          <p className="text-[13px]">Đề tạo ra ở trạng thái Nháp để bạn kiểm tra, sửa rồi mới phát hành. Hoặc chọn một đề ở trên / bấm &quot;Đề trống&quot; để tự soạn.</p>
          <label className="inline-flex items-center gap-2 text-[13px]">Số câu tối đa
            <select value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 px-2 py-1">
              {GEN_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-4 items-start">
          {/* TRÁI: danh sách câu */}
          <div className={`${card} flex flex-col lg:h-[calc(100vh-220px)]`}>
            <div className="p-4 border-b border-slate-100 dark:border-white/10 font-bold">Câu hỏi ({quiz.questions.length})</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {quiz.questions.map((x, i) => (
                <div key={x.id ?? i} onClick={() => setActive(i)}
                  className={`p-3 rounded-xl border-2 cursor-pointer ${active === i ? "border-[#e0e7ff] bg-[#f0f5ff] dark:bg-white/5" : "border-transparent bg-slate-50 dark:bg-white/[.03] hover:bg-slate-100"}`}>
                  <div className="text-sm font-semibold">{i + 1} • <span className={complete(x) ? "text-green-600" : "text-amber-600"}>{complete(x) ? "Đủ" : "Chưa đủ"}</span></div>
                  <div className="mt-1 truncate text-[13px] text-slate-500">{x.text || "(chưa có nội dung)"}</div>
                  {results && x.id && results.correct_rate[x.id] != null && (
                    <div className="mt-1 text-[12px] text-slate-500">Tỉ lệ đúng: {Math.round((results.correct_rate[x.id] ?? 0) * 100)}%</div>
                  )}
                  {active === i && draft && (
                    <div className="mt-2 flex justify-center gap-4 text-slate-400">
                      <button type="button" title="Nhân bản" className="bg-transparent border-0 cursor-pointer hover:text-[#4f2b96]"
                        onClick={(e) => { e.stopPropagation(); edit({ questions: [...quiz.questions.slice(0, i + 1), { ...x, id: undefined }, ...quiz.questions.slice(i + 1)] }); }}>
                        <Copy size={16} />
                      </button>
                      <button type="button" title="Xóa câu" className="bg-transparent border-0 cursor-pointer hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); const qs = quiz.questions.filter((_, k) => k !== i); edit({ questions: qs.length ? qs : [emptyQ()] }); setActive(Math.max(0, i - 1)); }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {draft && (
              <div className="p-3 border-t border-slate-100 dark:border-white/10">
                <button type="button" onClick={() => { edit({ questions: [...quiz.questions, emptyQ()] }); setActive(quiz.questions.length); }}
                  className="w-full py-2.5 rounded-full border-2 border-[#4f2b96] text-[#4f2b96] font-semibold flex items-center justify-center gap-2 hover:bg-[#f5f3ff] bg-transparent cursor-pointer">
                  <Plus size={18} /> Thêm câu hỏi
                </button>
              </div>
            )}
          </div>

          {/* GIỮA: soạn câu */}
          <div className={`${card} p-6`}>
            <h2 className="font-bold text-lg mb-4">Câu {active + 1}</h2>
            {!draft && <p className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">Đề đang {STATUS[quiz.status]} — chỉ xem. Đưa về Nháp để sửa (chỉ được khi chưa có bài làm).</p>}
            {q && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-1 flex items-start focus-within:border-[#4f2b96]">
                  <div className="p-3 text-slate-400"><HelpCircle size={20} /></div>
                  <textarea value={q.text} disabled={!draft} onChange={(e) => editQ(active, { text: e.target.value })} placeholder="Nhập câu hỏi"
                    className="w-full p-3 pl-0 min-h-[100px] outline-none resize-none bg-transparent" />
                </div>
                <div className="space-y-3">
                  {["A", "B", "C", "D"].map((letter, i) => (
                    <div key={letter} className={`flex items-center gap-3 rounded-xl border p-1.5 ${q.correct === i ? "border-green-500 bg-green-50/60 dark:bg-green-950/40" : "border-slate-200 dark:border-white/10"}`}>
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 font-bold flex items-center justify-center text-sm ml-1 shrink-0">{letter}</div>
                      <input value={q.options[i] ?? ""} disabled={!draft} placeholder={`Lựa chọn ${letter}`}
                        onChange={(e) => editQ(active, { options: q.options.map((o, k) => (k === i ? e.target.value : o)) })}
                        className="flex-1 p-2 outline-none bg-transparent" />
                      <button type="button" disabled={!draft} onClick={() => editQ(active, { correct: i })} title="Đặt làm đáp án đúng"
                        aria-label={`Đáp án đúng là ${letter}`}
                        className={`mr-3 w-5 h-5 rounded-full border-2 p-0 cursor-pointer ${q.correct === i ? "border-green-600 bg-green-600" : "border-slate-300 bg-transparent hover:border-[#4f2b96]"}`} />
                    </div>
                  ))}
                  <p className="text-[12px] text-slate-500">Bấm vòng tròn bên phải để chọn đáp án đúng.</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-1 flex items-start focus-within:border-[#4f2b96]">
                  <div className="p-3 text-slate-400"><Info size={20} /></div>
                  <textarea value={q.explanation} disabled={!draft} onChange={(e) => editQ(active, { explanation: e.target.value })}
                    placeholder="Giải thích (không bắt buộc — chỉ hiện cho SV ở đề Luyện tập, sau khi nộp)"
                    className="w-full p-3 pl-0 min-h-[120px] outline-none resize-none bg-transparent" />
                </div>
              </div>
            )}
          </div>

          {/* PHẢI: cài đặt + thao tác */}
          <div className="space-y-4">
            <div className={`${card} p-5 space-y-3`}>
              <h3 className="font-bold">Thông tin đề</h3>
              <input value={quiz.title} disabled={!draft} onChange={(e) => edit({ title: e.target.value })} aria-label="Tên đề"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-3 text-sm outline-none focus:border-[#4f2b96]" />
              <div className="relative">
                <select value={quiz.kind} disabled={!draft} onChange={(e) => edit({ kind: e.target.value })} aria-label="Loại đề"
                  className="w-full appearance-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-3 text-sm outline-none">
                  {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[12px] text-slate-500">
                {quiz.kind === "practice" ? "Luyện tập: làm nhiều lần, xem đáp án + giải thích sau khi nộp." : "Kiểm tra/thi: làm 1 lần, sinh viên chỉ thấy điểm (không lộ đáp án)."}
              </p>
            </div>
            {draft && (
              <div className={`${card} p-5 space-y-3`}>
                <h3 className="font-bold">Thêm câu từ PDF</h3>
                <p className="text-[12px] text-slate-500">Đề có sẵn → AI chép câu hỏi + đáp án; tài liệu học → AI soạn câu mới. Câu được thêm vào cuối đề.</p>
                <div className="flex items-center gap-2">
                  <select value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} aria-label="Số câu tối đa"
                    className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 px-2 py-2 text-sm">
                    {GEN_COUNTS.map((n) => <option key={n} value={n}>{n} câu</option>)}
                  </select>
                  <PdfButton busy={busy} label="Chọn file PDF" onFile={(f) => void fromPdf(f, quiz.id)}
                    className="flex-1 rounded-full border-2 border-[#4f2b96] text-[#4f2b96] py-2 text-sm font-semibold hover:bg-[#f5f3ff]" />
                </div>
              </div>
            )}
            <div className={`${card} p-5`}>
              <h3 className="font-bold mb-3">Thời gian làm bài</h3>
              <div className="flex flex-wrap gap-2">
                {TIMES.map(([label, s]) => (
                  <button key={label} type="button" disabled={!draft} onClick={() => edit({ time_limit_s: s })}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium cursor-pointer ${quiz.time_limit_s === s ? "border-2 border-[#4f2b96] bg-white dark:bg-transparent text-[#4f2b96]" : "border-2 border-transparent bg-slate-50 dark:bg-white/5 text-slate-500 hover:bg-slate-100"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${card} p-5 space-y-2`}>
              <p className="text-sm">Trạng thái: <strong>{STATUS[quiz.status]}</strong>{dirty && <span className="text-amber-600"> · chưa lưu</span>}</p>
              {draft && <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="w-full rounded-full bg-black text-white dark:bg-white dark:text-black py-2.5 font-semibold cursor-pointer border-0 disabled:opacity-40">Lưu</button>}
              {draft && <button type="button" disabled={busy} onClick={() => void setStatus("Published")} className="w-full rounded-full bg-[#4f2b96] text-white py-2.5 font-semibold cursor-pointer border-0 disabled:opacity-40">Phát hành cho sinh viên</button>}
              {quiz.status === "Published" && <button type="button" disabled={busy} onClick={() => void setStatus("Closed")} className="w-full rounded-full border-2 border-slate-300 py-2.5 font-semibold cursor-pointer bg-transparent">Đóng đề</button>}
              {quiz.status === "Closed" && <button type="button" disabled={busy} onClick={() => void setStatus("Published")} className="w-full rounded-full border-2 border-[#4f2b96] text-[#4f2b96] py-2.5 font-semibold cursor-pointer bg-transparent">Mở lại</button>}
              {!draft && <button type="button" disabled={busy} onClick={() => void setStatus("Draft")} className="w-full rounded-full border border-slate-200 py-2 text-sm cursor-pointer bg-transparent">Đưa về Nháp để sửa</button>}
              {!draft && <button type="button" onClick={() => void showResults()} className="w-full rounded-full border border-slate-200 py-2 text-sm cursor-pointer bg-transparent">Xem kết quả</button>}
              {draft && <button type="button" onClick={() => void remove()} className="w-full rounded-full border border-red-200 text-red-600 py-2 text-sm cursor-pointer bg-transparent">Xóa đề</button>}
            </div>
            {results && (
              <div className={`${card} p-5`}>
                <h3 className="font-bold mb-2">Kết quả ({results.attempts.length} bài nộp)</h3>
                {results.attempts.length === 0 ? <p className="text-sm text-slate-500">Chưa có bài nộp.</p> : (
                  <ul className="space-y-1 text-sm">
                    {results.attempts.map((a, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{a.student}</span>
                        <span>{a.score}/{a.total}{a.late && <span className="text-amber-600"> · muộn</span>}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
