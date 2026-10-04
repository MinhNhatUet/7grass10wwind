"use client";

// Lộ trình học (bố cục TV4, dữ liệu thật — D-39): tạo lộ trình bằng Learning Assistant theo môn được phép (server kiểm quyền),
// danh sách/tiến độ lấy từ /learning/plans; mở lộ trình là PlanCard (ôn tập theo ngày, Google Calendar, .ics).
// Tạo lộ trình / ôn tập → chuyển sang chat ngay, chat gửi yêu cầu và hiện đang trả lời (D-45).
// D-83: một trang cho cả hai loại lộ trình — "Theo tiến độ" (đánh giá → lỗ hổng → lộ trình, D-82) và "Theo ngày";
// phần đang ôn của cả hai được ghim thành tag "Đang ôn" ở đầu khung (StudyPinsBar).

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Calendar, Clock, Lightbulb, ListTodo, Plus, Sparkles, Target, TrendingUp } from "lucide-react";
import { api, type CourseItem } from "@/lib/api";
import { LessonPicker, MyPlans, describeLesson, goToChat, lessonLabel, type Chapter } from "@/components/learning-hub";
import { ProgressPath } from "@/components/learning-path";

const field = "w-full rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-black/30 py-3 pr-4 text-[15px] outline-none focus:border-black focus:ring-2 focus:ring-black/10";

const GUIDE = [
  { icon: Target, title: "Đặt mục tiêu", text: "Chọn môn và nội dung muốn học, số ngày, số phút mỗi ngày." },
  { icon: ListTodo, title: "AI xây dựng lộ trình", text: "Chia buổi học từ tài liệu môn học đã phát hành." },
  { icon: Clock, title: "Theo dõi tiến độ", text: "Xác nhận lộ trình, đánh dấu buổi đã học, đưa lịch vào Google Calendar." },
  { icon: TrendingUp, title: "Ôn tập theo ngày", text: "Mỗi buổi có nút Ôn tập — chọn trắc nghiệm, flashcard, điền khuyết…" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTH_HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MAX_PLAN_DAYS = 60; // backend nhận tối đa 60 ngày
const ddmm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

/** Mọi ngày từ hôm nay đến hết `until` (YYYY-MM-DD), tối đa MAX_PLAN_DAYS ngày. */
function daysUntil(until: string): string[] {
  const out: string[] = [];
  for (const d = new Date(); iso(d) <= until && out.length < MAX_PLAN_DAYS; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

/** Lịch tháng (D-46). `range`: bấm một ngày = học mỗi ngày từ hôm nay đến ngày đó (D-81); không thì bấm từng ngày
 * để chọn/bỏ. Không chọn ngày đã qua; tối đa 60 ngày. */
function DayPicker({ value, onChange, range = false, onSuggestUntil }: {
  value: string[]; onChange: (v: string[]) => void; range?: boolean; onSuggestUntil?: (d: string) => void;
}) {
  const today = iso(new Date());
  const lastAllowed = daysUntil("9999-12-31").at(-1) ?? today;
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const first = (month.getDay() + 6) % 7; // thứ Hai đứng đầu
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const picked = new Set(value);
  const toggle = (d: string) => {
    if (range) return onChange(daysUntil(d));
    const next = new Set(picked);
    if (next.has(d)) next.delete(d);
    else if (next.size < 60) next.add(d);
    onChange([...next].sort());
  };
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const canBack = iso(new Date(month.getFullYear(), month.getMonth(), 0)) >= today;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/15 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={!canBack} aria-label="Tháng trước" className="rounded-lg px-3 py-1 border-0 bg-transparent cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30">‹</button>
        <span className="text-sm font-semibold">Tháng {month.getMonth() + 1}/{month.getFullYear()}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Tháng sau" className="rounded-lg px-3 py-1 border-0 bg-transparent cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[13px]">
        {MONTH_HEAD.map((h) => <span key={h} className="py-1 text-[12px] font-medium text-slate-400">{h}</span>)}
        {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
          <button key={d} type="button" disabled={d < today || (range && d > lastAllowed)} onClick={() => toggle(d)} aria-pressed={picked.has(d)} aria-label={`Ngày ${d}`}
            className={`h-9 rounded-lg border-0 cursor-pointer disabled:cursor-default disabled:opacity-30 ${picked.has(d) ? "bg-black text-white dark:bg-white dark:text-black font-semibold" : "bg-transparent hover:bg-slate-100 dark:hover:bg-white/10"} ${d === today && !picked.has(d) ? "ring-1 ring-slate-400" : ""}`}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500">
        <span>{range
          ? (value.length ? `Học mỗi ngày từ hôm nay (${ddmm(value[0])}) đến ${ddmm(value[value.length - 1])} — ${value.length} ngày.` : "Bấm vào ngày cuối cùng bạn muốn học.")
          : (value.length ? `${value.length} ngày đã chọn: ${value.map(ddmm).join(", ")}` : "Bấm vào các ngày bạn muốn học.")}</span>
        {/* Chỉ chọn 1 ngày ở chế độ chọn từng ngày thường là ý "học đến ngày này" → gợi ý chuyển chế độ */}
        {!range && value.length === 1 && value[0] > today && onSuggestUntil && (
          <button type="button" onClick={() => onSuggestUntil(value[0])} className="rounded-lg border-0 bg-black px-3 py-1 font-medium text-white dark:bg-white dark:text-black cursor-pointer">
            Học mỗi ngày đến {ddmm(value[0])}
          </button>
        )}
        {value.length > 0 && <button type="button" onClick={() => onChange([])} className="border-0 bg-transparent underline cursor-pointer text-slate-500">Bỏ chọn hết</button>}
      </div>
    </div>
  );
}

export default function LearningPlansPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseItem[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [lessons, setLessons] = useState<Chapter[]>([]); // D-52: chọn bài thay vì gõ nội dung
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<"count" | "until" | "dates">("count");
  const [dates, setDates] = useState<string[]>([]);
  const [until, setUntil] = useState(""); // "Học đến ngày": học mỗi ngày từ hôm nay đến hạn này
  const untilDates = until ? daysUntil(until) : [];
  const chosen = mode === "dates" ? dates : mode === "until" ? untilDates : null;
  const [minutes, setMinutes] = useState(45);
  const [tab, setTab] = useState<"progress" | "days">("progress");
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  // ?tab=progress|days, ?plan= (mở từ tag "Đang ôn")
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc URL sau hydrate (server không có window)
    if (q.get("tab") === "days" || q.get("plan")) setTab("days");
    setOpenPlanId(q.get("plan"));
  }, []);

  useEffect(() => {
    api<{ items: CourseItem[] }>("/me/courses")
      .then((r) => { setCourses(r.items); setCourseId(r.items[0]?.id ?? ""); })
      .catch(() => window.location.replace("/login"));
  }, []);

  function create(e: FormEvent) {
    e.preventDefault();
    if (!lessons.length || !courseId || (chosen && chosen.length === 0)) return;
    const goal = lessons.map(lessonLabel).join("; ");
    const when = mode === "until" && chosen
      ? `mỗi ngày từ ${ddmm(chosen[0])} đến ${ddmm(chosen[chosen.length - 1])} (${chosen.length} ngày)`
      : chosen ? `vào ${chosen.length} ngày đã chọn (${chosen.map(ddmm).join(", ")})` : `trong ${days} ngày`;
    const content = `Lập lộ trình học ${lessons.length} bài (${lessons.map((l) => l.chapter).join(", ")}) ${when}, mỗi ngày ${minutes} phút`;
    goToChat(router, content, {
      content, assistant: "learning",
      learning: {
        action: "plan", goal, days: chosen ? chosen.length : days, minutes_per_day: minutes,
        ...(chosen ? { dates: chosen } : {}), ...(lessons.length > 1 ? { topics: lessons.map(describeLesson) } : {}),
      },
    }, courseId);
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa] dark:bg-[#081018] text-slate-800 dark:text-slate-100 font-sans">

      <div className="max-w-[1400px] mx-auto p-6 md:p-8">
        <div className="flex items-center gap-5 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lộ trình học tập</h1>
            <p className="text-slate-500 text-[15px] mt-1.5">Xây dựng và theo dõi lộ trình học cá nhân hóa từ tài liệu môn học · bấm ôn phần nào, phần đó được ghim lên thanh &quot;Đang ôn&quot; để đổi qua lại</p>
          </div>
        </div>

        <div role="tablist" aria-label="Loại lộ trình" className="mb-6 inline-flex rounded-xl bg-slate-100 dark:bg-white/10 p-1 text-sm">
          {([["progress", "Theo tiến độ", "Đánh giá phần đã học → lỗ hổng → lộ trình"], ["days", "Theo ngày", "Lịch học theo số ngày/phút"]] as const).map(([k, v, hint]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} title={hint}
              onClick={() => { setTab(k); window.history.replaceState(null, "", `/learning/plans?tab=${k}`); }}
              className={`rounded-lg px-5 py-2 border-0 cursor-pointer ${tab === k ? "bg-white dark:bg-black/40 font-semibold shadow-sm" : "bg-transparent text-slate-500"}`}>{v}</button>
          ))}
        </div>

        {tab === "progress" ? (
          courses === null ? <p className="text-slate-500">Đang tải…</p> : courses.length === 0 ? (
            <p className="text-slate-500">Bạn chưa được ghi danh môn nào.</p>
          ) : (
            <ProgressPath courses={courses}
              onPractice={(cid, action, topic, label) => {
                const content = `Lộ trình — ${label}`;
                goToChat(router, content, { content, assistant: "learning", learning: { action, topic } }, cid);
              }}
              onFind={(cid, query) => {
                const content = `Tìm tài liệu học về ${query}`;
                goToChat(router, content, { content, assistant: "hub" }, cid);
              }} />
          )
        ) : (

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
          <div className="space-y-6">
            <button type="button" onClick={() => setShowForm((v) => !v)}
              className="w-full py-3.5 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold text-[15px] flex items-center justify-center gap-2 hover:opacity-80 shadow-md cursor-pointer border-0">
              <Plus size={18} /> Tạo lộ trình mới
            </button>
            <div className="bg-white dark:bg-[#12181f] rounded-3xl shadow-sm border border-slate-100 dark:border-white/10 p-6">
              <p className="flex items-center gap-3 font-bold text-[16px] mb-4"><Lightbulb size={20} /> Hướng dẫn</p>
              <div className="space-y-5">
                {GUIDE.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0"><Icon size={18} /></div>
                    <div>
                      <h2 className="font-bold text-[14px]">{title}</h2>
                      <p className="text-[13px] text-slate-500 mt-0.5">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {showForm && (
              <form onSubmit={create} className="bg-white dark:bg-[#12181f] rounded-3xl shadow-sm border border-slate-100 dark:border-white/10 p-8 space-y-5">
                <h2 className="text-xl font-bold flex items-center gap-2"><Target /> Tạo lộ trình mới</h2>
                <label className="block">
                  <span className="block text-sm font-semibold mb-2">Chọn môn học</span>
                  <span className="relative block">
                    <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessons([]); }} className={`${field} pl-11`}>
                      {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {courses?.length === 0 && <option value="">Bạn chưa được ghi danh môn nào</option>}
                    </select>
                  </span>
                </label>
                <div>
                  <span className="block text-sm font-semibold mb-2">Chọn bài muốn học</span>
                  <LessonPicker courseId={courseId} max={15} picked={lessons} onChange={setLessons} />
                </div>
                <div role="radiogroup" aria-label="Cách chọn ngày học" className="flex rounded-xl bg-slate-100 dark:bg-white/10 p-1 text-sm">
                  {([["count", "Số ngày liên tiếp"], ["until", "Học đến ngày"], ["dates", "Chọn từng ngày"]] as const).map(([k, v]) => (
                    <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                      className={`flex-1 rounded-lg py-2 border-0 cursor-pointer ${mode === k ? "bg-white dark:bg-black/40 font-semibold shadow-sm" : "bg-transparent text-slate-500"}`}>{v}</button>
                  ))}
                </div>
                {mode === "dates" && <DayPicker value={dates} onChange={setDates} onSuggestUntil={(d) => { setUntil(d); setMode("until"); }} />}
                {mode === "until" && <DayPicker range value={untilDates} onChange={(v) => setUntil(v.at(-1) ?? "")} />}
                <div className={`grid gap-5 ${mode === "count" ? "grid-cols-2" : "grid-cols-1"}`}>
                  {mode === "count" && (
                    <label className="block">
                      <span className="block text-sm font-semibold mb-2">Số ngày</span>
                      <span className="relative block">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} className={`${field} pl-11`} />
                      </span>
                    </label>
                  )}
                  <label className="block">
                    <span className="block text-sm font-semibold mb-2">Phút mỗi ngày</span>
                    <span className="relative block">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="number" min={10} max={300} step={5} value={minutes} onChange={(e) => setMinutes(Math.min(300, Math.max(10, Number(e.target.value) || 10)))} className={`${field} pl-11`} />
                    </span>
                  </label>
                </div>
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-white/10">
                  <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 bg-transparent border-0 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10">Hủy</button>
                  <button type="submit" disabled={!courseId || !lessons.length || (chosen !== null && chosen.length === 0)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium bg-black text-white dark:bg-white dark:text-black border-0 cursor-pointer hover:opacity-80 disabled:opacity-50">
                    <Sparkles size={18} />
                    Tạo lộ trình bằng AI
                  </button>
                </div>
              </form>
            )}
            <MyPlans openId={openPlanId} />
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
