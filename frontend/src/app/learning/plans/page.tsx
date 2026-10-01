"use client";

// Lộ trình học (bố cục TV4, dữ liệu thật — D-39): tạo lộ trình bằng Learning Assistant theo môn được phép (server kiểm quyền),
// danh sách/tiến độ lấy từ /learning/plans; mở lộ trình là PlanCard (ôn tập theo ngày, Google Calendar, .ics).
// Tạo lộ trình / ôn tập → chuyển sang chat ngay, chat gửi yêu cầu và hiện đang trả lời (D-45).

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Calendar, Clock, Home, Lightbulb, ListTodo, Plus, Sparkles, Target, TrendingUp } from "lucide-react";
import { api, type CourseItem } from "@/lib/api";
import { MyPlans, goToChat } from "@/components/learning-hub";

const field = "w-full rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-black/30 py-3 pr-4 text-[15px] outline-none focus:border-black focus:ring-2 focus:ring-black/10";

const GUIDE = [
  { icon: Target, title: "Đặt mục tiêu", text: "Chọn môn và nội dung muốn học, số ngày, số phút mỗi ngày." },
  { icon: ListTodo, title: "AI xây dựng lộ trình", text: "Chia buổi học từ tài liệu môn học đã phát hành." },
  { icon: Clock, title: "Theo dõi tiến độ", text: "Xác nhận lộ trình, đánh dấu buổi đã học, đưa lịch vào Google Calendar." },
  { icon: TrendingUp, title: "Ôn tập theo ngày", text: "Mỗi buổi có nút Ôn tập — chọn trắc nghiệm, flashcard, điền khuyết…" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTH_HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Lịch tháng: bấm từng ngày để chọn/bỏ (D-46). Không chọn ngày đã qua; tối đa 60 ngày. */
function DayPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const today = iso(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const first = (month.getDay() + 6) % 7; // thứ Hai đứng đầu
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const picked = new Set(value);
  const toggle = (d: string) => {
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
          <button key={d} type="button" disabled={d < today} onClick={() => toggle(d)} aria-pressed={picked.has(d)} aria-label={`Ngày ${d}`}
            className={`h-9 rounded-lg border-0 cursor-pointer disabled:cursor-default disabled:opacity-30 ${picked.has(d) ? "bg-black text-white dark:bg-white dark:text-black font-semibold" : "bg-transparent hover:bg-slate-100 dark:hover:bg-white/10"} ${d === today && !picked.has(d) ? "ring-1 ring-slate-400" : ""}`}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500">
        <span>{value.length ? `${value.length} ngày đã chọn: ${value.map((d) => `${d.slice(8)}/${d.slice(5, 7)}`).join(", ")}` : "Bấm vào các ngày bạn muốn học."}</span>
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
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<"count" | "dates">("count");
  const [dates, setDates] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(45);

  useEffect(() => {
    api<{ items: CourseItem[] }>("/me/courses")
      .then((r) => { setCourses(r.items); setCourseId(r.items[0]?.id ?? ""); })
      .catch(() => window.location.replace("/login"));
  }, []);

  function create(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim() || !courseId || (mode === "dates" && dates.length === 0)) return;
    const chosen = mode === "dates" ? dates : null;
    const when = chosen ? `vào ${chosen.length} ngày đã chọn (${chosen.map((d) => `${d.slice(8)}/${d.slice(5, 7)}`).join(", ")})` : `trong ${days} ngày`;
    const content = `Lập lộ trình học: ${goal.trim()} ${when}, mỗi ngày ${minutes} phút`;
    goToChat(router, content, {
      content, assistant: "learning",
      learning: { action: "plan", goal: goal.trim(), days: chosen ? chosen.length : days, minutes_per_day: minutes, ...(chosen ? { dates: chosen } : {}) },
    }, courseId);
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#081018] text-slate-800 dark:text-slate-100 font-sans">
      <header className="h-[64px] bg-white dark:bg-[#12181f] border-b border-slate-200 dark:border-white/10 flex items-center px-6 sticky top-0 z-20">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
          <Link href="/" aria-label="Trang chat" className="text-black dark:text-white"><Home size={18} /></Link>
          <span className="text-slate-300">/</span>
          <Link href="/learning" className="text-slate-500 no-underline hover:text-black dark:hover:text-white">Học tập</Link>
          <span className="text-slate-300">/</span>
          <span className="text-black dark:text-white">Lộ trình học tập</span>
        </nav>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 md:p-8">
        <div className="flex items-center gap-5 mb-8">
          <Link href="/" aria-label="Quay lại chat" className="w-12 h-12 flex items-center justify-center rounded-full bg-white dark:bg-white/10 shadow-sm border border-slate-100 dark:border-white/10 text-black dark:text-white"><ArrowLeft size={24} /></Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lộ trình học tập</h1>
            <p className="text-slate-500 text-[15px] mt-1.5">Xây dựng và theo dõi lộ trình học cá nhân hóa từ tài liệu môn học</p>
          </div>
        </div>

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
                    <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={`${field} pl-11`}>
                      {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {courses?.length === 0 && <option value="">Bạn chưa được ghi danh môn nào</option>}
                    </select>
                  </span>
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold mb-2">Nội dung muốn học</span>
                  <input autoFocus required value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Vd: Đồ thị Euler và Hamilton, cây khung…" className={`${field} pl-4`} />
                </label>
                <div role="radiogroup" aria-label="Cách chọn ngày học" className="flex rounded-xl bg-slate-100 dark:bg-white/10 p-1 text-sm">
                  {([["count", "Số ngày liên tiếp"], ["dates", "Chọn ngày trên lịch"]] as const).map(([k, v]) => (
                    <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                      className={`flex-1 rounded-lg py-2 border-0 cursor-pointer ${mode === k ? "bg-white dark:bg-black/40 font-semibold shadow-sm" : "bg-transparent text-slate-500"}`}>{v}</button>
                  ))}
                </div>
                {mode === "dates" && <DayPicker value={dates} onChange={setDates} />}
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
                  <button type="submit" disabled={!courseId || (mode === "dates" && dates.length === 0)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium bg-black text-white dark:bg-white dark:text-black border-0 cursor-pointer hover:opacity-80 disabled:opacity-50">
                    <Sparkles size={18} />
                    Tạo lộ trình bằng AI
                  </button>
                </div>
              </form>
            )}
            <MyPlans />
          </div>
        </div>
      </div>
    </div>
  );
}
