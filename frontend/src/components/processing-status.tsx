import { errorCodeMessage } from "../lib/api-errors";

export type ProcessingInfo = {
  chunk_count?: number;
  embedded_count?: number;
  job?: { id: string; kind: string; stage: string; status: string; progress: number; error_code?: string | null; attempts: number } | null;
};

export default function ProcessingStatus({ version, compact = false }: { version: ProcessingInfo; compact?: boolean }) {
  const job = version.job;
  if (!job) return null;
  const stages: Record<string, string> = { queued: "Đang chờ xử lý", extract: "Đang trích xuất văn bản", extracted: "Đã trích xuất — chờ gửi duyệt", index: "Đang lập chỉ mục", embedding: "Đang tạo embedding", publishing: "Đang phát hành", published: "Đã xử lý và phát hành" };
  const working = ["queued", "running"].includes(job.status);
  const percent = Math.round(Math.max(0, Math.min(1, job.progress)) * 100);
  return <div className={compact ? "mt-3 space-y-1 text-xs" : "my-4 space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm"}>
    <p className="font-medium">{job.status === "failed" ? "Xử lý thất bại" : stages[job.stage] || "Đang xử lý tài liệu"}</p>
    {working && (job.kind === "extract" ? <p>Đang đọc file, thời gian tùy thuộc dung lượng…</p> : <><progress aria-label="Tiến độ tạo chỉ mục" value={percent} max={100} className="h-2 w-full accent-blue-600" /><p>{percent}%</p></>)}
    <p className="text-slate-600">{version.chunk_count || 0} đoạn văn bản · {version.embedded_count || 0}/{version.chunk_count || 0} đã tạo embedding</p>
    {!compact && job.error_code && <p role="alert" className="text-red-700">{errorCodeMessage(job.error_code)} Bạn có thể bấm “Thử lại xử lý” bên dưới.</p>}
  </div>;
}
