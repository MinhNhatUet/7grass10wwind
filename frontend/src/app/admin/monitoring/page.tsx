"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, Coins, Info, RefreshCw, Search, Users, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminShell from "@/components/admin-shell";
import { API, authHeaders, responseError } from "@/lib/api-errors";

type Metrics = { total_queries: number; latency_p95_ms: number | null };
// These series are illustrative until the API exposes historical data.
const latencyData = [
  { time: "08:00", p50: 120, p95: 350 }, { time: "09:00", p50: 135, p95: 410 },
  { time: "10:00", p50: 180, p95: 520 }, { time: "11:00", p50: 150, p95: 380 },
  { time: "12:00", p50: 110, p95: 290 }, { time: "13:00", p50: 140, p95: 420 }, { time: "14:00", p50: 160, p95: 490 },
];
const usageData = [
  { day: "T2", tokens: 120000 }, { day: "T3", tokens: 150000 }, { day: "T4", tokens: 200000 },
  { day: "T5", tokens: 180000 }, { day: "T6", tokens: 220000 }, { day: "T7", tokens: 90000 }, { day: "CN", tokens: 80000 },
];
const topSubjects = [
  { name: "Cấu trúc dữ liệu và giải thuật", requests: 1245 }, { name: "Hệ cơ sở dữ liệu", requests: 980 },
  { name: "Lập trình hướng đối tượng", requests: 850 }, { name: "Trí tuệ nhân tạo", requests: 720 }, { name: "Mạng máy tính", requests: 560 },
];
const topQuestions = [
  { query: "Giải thích thuật toán Dijkstra?", count: 145, subject: "CTDL & GT" },
  { query: "Sự khác nhau giữa INNER JOIN và LEFT JOIN?", count: 120, subject: "Hệ cơ sở dữ liệu" },
  { query: "Tính đa hình trong OOP là gì?", count: 98, subject: "Lập trình hướng đối tượng" },
  { query: "Cách hoạt động của giao thức TCP?", count: 85, subject: "Mạng máy tính" },
  { query: "Mạng nơ-ron nhân tạo là gì?", count: 76, subject: "Trí tuệ nhân tạo" },
];
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };

export default function AdminMonitoringPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError("");
    fetch(`${API}/metrics?days=7`, { headers: authHeaders(), signal: controller.signal })
      .then(async r => { if (!r.ok) throw await responseError(r); return r.json(); })
      .then(data => { if (!controller.signal.aborted) setMetrics(data); })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setMetrics(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const cards = [
    { label: "Lượt yêu cầu", value: metrics?.total_queries.toLocaleString("vi-VN") ?? "—", note: "Toàn hệ thống · 7 ngày gần nhất", icon: Users, color: "bg-blue-500/10 text-blue-500" },
    { label: "Độ trễ phản hồi · p95", value: metrics?.latency_p95_ms != null ? `${metrics.latency_p95_ms.toLocaleString("vi-VN")} ms` : "—", note: "Thống kê trong 7 ngày", icon: Activity, color: "bg-emerald-500/10 text-emerald-500" },
    { label: "Token ước tính", value: metrics ? (metrics.total_queries * 150).toLocaleString("vi-VN") : "—", note: "Ước tính 150 token / yêu cầu", icon: Zap, color: "bg-violet-500/10 text-violet-500" },
    { label: "Chi phí ước tính", value: metrics ? `$${(metrics.total_queries * 150 * 0.00002).toFixed(2)}` : "—", note: "Giả định $0.00002 / token", icon: Coins, color: "bg-amber-500/10 text-amber-500" },
  ];

  return <AdminShell>
    <div className="admin-heading"><div><span className="admin-eyebrow">Tổng quan hệ thống</span><h1>Giám sát vận hành</h1><p>Theo dõi hiệu suất, chi phí và mức sử dụng tài nguyên ở một nơi.</p></div><div className="flex items-center gap-3"><span className="admin-pill">7 ngày gần nhất</span><button disabled={loading} onClick={() => setAttempt(n => n + 1)} className="admin-btn"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Tải lại</button></div></div>
    {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <section key={card.label} className="admin-panel p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</h2><span className={`grid h-10 w-10 place-items-center rounded-xl ${card.color}`}><card.icon size={19} /></span></div><p className="mt-4 text-3xl font-bold tracking-tight tabular-nums">{loading ? "—" : card.value}</p><p className="mt-2 text-xs text-slate-400">{card.note}</p></section>)}</div>
    {loading && <p role="status" className="mt-3 text-xs text-slate-500">Đang cập nhật số liệu…</p>}
    <div className="my-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-xs leading-5 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"><Info size={16} className="mt-0.5 shrink-0" />Biểu đồ và danh sách bên dưới là dữ liệu minh họa. API hiện chưa cung cấp chuỗi thời gian và bảng xếp hạng.</div>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="admin-panel"><header className="admin-panel-header"><div><h2>Độ trễ hệ thống</h2><p>Thời gian phản hồi p50 và p95 · mili giây</p></div><span className="admin-pill">Minh họa</span></header><div className="h-[300px] p-4 sm:p-5"><ResponsiveContainer width="100%" height="100%"><LineChart data={latencyData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" /><XAxis dataKey="time" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} /><YAxis fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 16 }} /><Line type="monotone" name="p50 · Trung vị" dataKey="p50" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" name="p95 · Phân vị 95" dataKey="p95" stroke="#94a3b8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div></section>
      <section className="admin-panel"><header className="admin-panel-header"><div><h2>Mức sử dụng token</h2><p>Phân bố lượng token theo ngày trong tuần</p></div><span className="admin-pill">Minh họa</span></header><div className="h-[300px] p-4 sm:p-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={usageData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" /><XAxis dataKey="day" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} /><YAxis tickFormatter={v => `${v / 1000}k`} fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#8b5cf60a" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 16 }} /><Bar dataKey="tokens" name="Số lượng token" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={36} /></BarChart></ResponsiveContainer></div></section>
      <section className="admin-panel"><header className="admin-panel-header"><div><h2 className="flex items-center gap-2"><BookOpen size={17} className="text-slate-400" />Môn học phổ biến</h2><p>Top 5 môn học theo số lượng truy vấn · Minh họa</p></div><ArrowUpRight size={18} className="text-slate-300" /></header><div className="divide-y divide-slate-100 px-5 dark:divide-white/5">{topSubjects.map((subject, i) => <div key={subject.name} className="flex items-center gap-3 py-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-white/5">{String(i + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 text-sm font-medium">{subject.name}</span><span className="text-xs tabular-nums text-slate-400">{subject.requests.toLocaleString("vi-VN")} lượt</span></div>)}</div></section>
      <section className="admin-panel"><header className="admin-panel-header"><div><h2 className="flex items-center gap-2"><Search size={17} className="text-slate-400" />Câu hỏi thường gặp</h2><p>Những chủ đề được quan tâm nhiều nhất · Minh họa</p></div></header><div className="divide-y divide-slate-100 px-5 dark:divide-white/5">{topQuestions.map(q => <div key={q.query} className="flex items-start gap-4 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium leading-5">{q.query}</p><p className="mt-1 text-xs text-slate-400">{q.subject}</p></div><span className="admin-pill shrink-0">{q.count} lần</span></div>)}</div></section>
    </div>
  </AdminShell>;
}
