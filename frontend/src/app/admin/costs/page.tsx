"use client";

// Chi phí AI ước tính (D-60): token thật của mọi lần gọi LLM × bảng giá cấu hình (.env). Chỉ số liệu vận hành,
// không có nội dung hội thoại (AC-01.6). Quyền admin do server kiểm tra.

import { useEffect, useState } from "react";
import { Coins, Info, RefreshCw } from "lucide-react";
import AdminShell from "@/components/admin-shell";
import { ApiError, api } from "@/lib/api";
import { MSG, errorMessage } from "@/lib/messages";

type Bucket = { requests: number; tokens_input: number; tokens_output: number; cost_usd: number };
type Named = Bucket & { name: string };
type Costs = {
  days: number;
  pricing: { model: string; input_per_1m_usd: number; output_per_1m_usd: number; usd_to_vnd: number };
  total: Bucket & { cost_vnd: number; untracked_requests: number };
  by_day: (Bucket & { date: string })[];
  by_assistant: Named[];
  by_course: Named[];
  top_users: Named[];
};

const ASSISTANT: Record<string, string> = {
  academic: "Hỏi đáp học thuật", learning: "Trợ lý học tập", hub: "Knowledge Hub", router: "Điều phối", auto: "Tự chọn trợ lý",
  quiz_generate: "Tạo đề từ PDF (giảng viên)", quiz_assess: "Chấm bài tự kiểm tra",
};
const PERIODS = [7, 30, 90, 365];
const num = (n: number) => n.toLocaleString("vi-VN");
const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;

function Table({ title, rows, label, vnd }: { title: string; rows: Named[]; label: (s: string) => string; vnd: number }) {
  return (
    <section className="admin-panel overflow-hidden">
      <header className="admin-panel-header"><h2>{title}</h2></header>
      {!rows.length ? <p className="admin-empty">Chưa có dữ liệu.</p> : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th>Tên</th><th className="text-right">Lượt</th><th className="text-right">Token (vào / ra)</th><th className="text-right">Chi phí</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{label(r.name)}</td>
                  <td className="text-right tabular-nums">{num(r.requests)}</td>
                  <td className="text-right tabular-nums">{num(r.tokens_input)} / {num(r.tokens_output)}</td>
                  <td className="text-right tabular-nums">{usd(r.cost_usd)} <span className="text-slate-400">≈ {num(Math.round(r.cost_usd * vnd))}₫</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminCostsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Costs | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(d: number) {
    setLoading(true);
    setError("");
    try {
      setData(await api<Costs>(`/admin/costs?days=${d}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail || errorMessage(e.code) : MSG.serviceError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load() chỉ setState sau await (dữ liệu server)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(days);
  }, [days]);

  const vnd = data?.pricing.usd_to_vnd ?? 0;
  const maxDay = Math.max(1e-9, ...(data?.by_day ?? []).map((d) => d.cost_usd));
  const t = data?.total;

  return (
    <AdminShell>
      <div className="admin-heading">
        <div>
          <span className="admin-eyebrow">Tài nguyên & ngân sách</span>
          <h1>Chi phí AI</h1>
          <p>Chi phí ước tính từ số token thật của mỗi lần gọi mô hình ngôn ngữ, theo bảng giá cấu hình.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setDays(p)} aria-pressed={days === p} className={`admin-btn ${days === p ? "admin-btn-primary" : ""}`}>
              {p === 365 ? "1 năm" : `${p} ngày`}
            </button>
          ))}
          <button type="button" className="admin-btn" onClick={() => void load(days)} disabled={loading} aria-label="Tải lại">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!data ? (
        <p role="status" className="admin-panel p-6">Đang tải…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Tổng chi phí", `${num(Math.round(t!.cost_vnd))}₫`, `${usd(t!.cost_usd)} · ${data.days} ngày qua`],
              ["Lượt gọi AI", num(t!.requests), t!.requests ? `≈ ${num(Math.round((t!.cost_vnd / t!.requests) * 100) / 100)}₫ / lượt` : "—"],
              ["Token đầu vào", num(t!.tokens_input), `$${data.pricing.input_per_1m_usd} / 1 triệu token`],
              ["Token đầu ra", num(t!.tokens_output), `$${data.pricing.output_per_1m_usd} / 1 triệu token`],
            ].map(([label, value, sub]) => (
              <div key={label} className="admin-panel p-5">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{sub}</p>
              </div>
            ))}
          </div>

          <section className="admin-panel">
            <header className="admin-panel-header"><div><h2 className="flex items-center gap-2"><Coins size={16} className="text-amber-500" />Chi phí theo ngày</h2><p>Rê chuột lên cột để xem chi tiết.</p></div></header>
            {!data.by_day.length ? <p className="admin-empty">Chưa có lượt gọi AI trong khoảng này.</p> : (
              <div className="flex h-48 items-end gap-1 overflow-x-auto p-5">
                {data.by_day.map((d) => (
                  <div key={d.date} className="flex h-full min-w-[14px] flex-1 flex-col justify-end"
                    title={`${d.date}: ${usd(d.cost_usd)} ≈ ${num(Math.round(d.cost_usd * vnd))}₫ · ${num(d.requests)} lượt · ${num(d.tokens_input + d.tokens_output)} token`}>
                    <div className="rounded-t bg-[#134d8b]/80 hover:bg-[#134d8b] dark:bg-[#7fb3ea]/80 dark:hover:bg-[#7fb3ea]" style={{ height: `${Math.max(2, (d.cost_usd / maxDay) * 100)}%` }} />
                    <span className="mt-1 text-center text-[10px] text-slate-400">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Table title="Theo chức năng" rows={data.by_assistant} label={(s) => ASSISTANT[s] ?? s} vnd={vnd} />
            <Table title="Theo môn học" rows={data.by_course} label={(s) => s} vnd={vnd} />
          </div>
          <Table title="Người dùng tốn nhiều nhất (top 10)" rows={data.top_users} label={(s) => s} vnd={vnd} />

          <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500 dark:border-white/10 dark:bg-white/5">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>
              Mô hình: <strong>{data.pricing.model}</strong>. Giá: ${data.pricing.input_per_1m_usd} (vào) / ${data.pricing.output_per_1m_usd} (ra) mỗi 1 triệu token, tỉ giá {num(data.pricing.usd_to_vnd)}₫/USD.
              Đổi trong <code>.env</code> (<code>LLM_PRICE_INPUT_PER_1M</code>, <code>LLM_PRICE_OUTPUT_PER_1M</code>, <code>USD_TO_VND</code>) cho khớp hoá đơn nhà cung cấp; chi phí đã ghi giữ theo giá tại thời điểm gọi.
              Chưa gồm embedding (Gemini, đang dùng gói miễn phí).
              {t!.untracked_requests > 0 && <> {num(t!.untracked_requests)} lượt cũ ghi trước khi bật đếm token nên tính 0₫.</>}
            </span>
          </p>
        </div>
      )}
    </AdminShell>
  );
}
