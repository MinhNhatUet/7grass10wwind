"use client";

import { useId, useState } from "react";

const btn = "rounded-full px-4 py-1.5 text-[13px] font-medium cursor-pointer border-0 bg-black text-white dark:bg-white dark:text-black hover:opacity-80 disabled:opacity-40";
const muted = "text-black/50 dark:text-white/50";
const btn2 = "rounded-full px-3 py-1.5 text-[13px] cursor-pointer border border-black/10 dark:border-white/15 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";

/** Hình thức ôn có số câu/thẻ — hoạt động khác (giải thích, tìm tài liệu) gửi ngay, không hỏi số câu. */
export const COUNTED_ACTIONS = new Set<string>(["mcq", "quiz", "flashcards", "cloze"]);

/** Số câu/thẻ tối đa theo số bài đã chọn — đúng `max_practice_count` ở API: 1–5 bài → 20, mỗi 5 bài thêm → +10, trần 50. */
export const maxPracticeCount = (lessons: number) => Math.min(50, 10 + 10 * Math.max(1, Math.ceil(lessons / 5)));
/** Tối thiểu 2 câu/thẻ mỗi bài (1 bài → 2, 2 bài → 4…) — đúng `min_practice_count` ở API. */
export const minPracticeCount = (lessons: number) => (lessons ? Math.min(2 * lessons, maxPracticeCount(lessons)) : 3);

/** Thanh trượt số câu (min–max theo LearningOptions.count ở API) + nút xác nhận. Dùng chung cho bộ chọn ôn tập,
 *  thanh ghim "Đang ôn" và các bước của lộ trình. */
export function CountPicker({ action, busy, onConfirm, onCancel, min = 3, max = 20 }: { action: string; busy?: boolean; onConfirm: (count: number) => void; onCancel?: () => void; min?: number; max?: number }) {
  const [raw, setCount] = useState(10);
  const count = Math.max(min, Math.min(raw, max)); // thêm/bỏ bài → khoảng đổi, không gửi số ngoài khoảng
  const id = useId();
  const unit = action === "flashcards" ? "thẻ" : "câu";
  return (
    <div className="mt-3 rounded-xl bg-[#f5f3ff] dark:bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-[13px]">Số {unit}:</label>
        <input id={id} type="range" min={min} max={max} step={1} value={count} onChange={(e) => setCount(Number(e.target.value))}
          className="w-40 flex-1 cursor-pointer accent-[#4f2b96]" aria-valuetext={`${count} ${unit}`} />
        <span className="w-14 text-right text-[13px] font-semibold tabular-nums text-[#4f2b96]">{count} {unit}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {onCancel && <button type="button" className={btn2} onClick={onCancel}>Hủy</button>}
        <button type="button" className={btn} disabled={busy} onClick={() => onConfirm(count)}>
          {busy ? "Đang tạo…" : `Xác nhận tạo ${count} ${unit}`}
        </button>
      </div>
    </div>
  );
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

export function PracticePicker({ onPick, onCancel, busy, min, max }: { onPick: (c: PracticeChoice) => void; onCancel?: () => void; busy?: boolean; min?: number; max?: number }) {
  // Chọn hình thức trước → hiện thanh trượt số câu ngay bên dưới → bấm xác nhận mới tạo bài
  const [action, setAction] = useState<PracticeChoice["action"] | null>(null);
  return (
    <div className="mt-2 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-black/20 p-3">
      <p className="text-[13px] font-semibold">Ôn tập theo hình thức</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(Object.keys(FORMAT_LABEL) as PracticeChoice["action"][]).map((a) => (
          <button key={a} type="button" onClick={() => setAction(a)} aria-pressed={action === a}
            className={`rounded-xl border-2 p-2 text-left cursor-pointer bg-transparent ${action === a ? "border-[#4f2b96] bg-[#f5f3ff] dark:bg-white/10" : "border-black/10 dark:border-white/15"}`}>
            <span className="block text-[13px] font-medium">{FORMAT_LABEL[a]}</span>
            <span className={`block text-[12px] ${muted}`}>{FORMAT_HINT[a]}</span>
          </button>
        ))}
      </div>
      {action && <CountPicker action={action} busy={busy} min={min} max={max} onCancel={onCancel} onConfirm={(count) => onPick({ action, count })} />}
      {!action && onCancel && (
        <div className="mt-3 flex justify-end"><button type="button" className={btn2} onClick={onCancel}>Hủy</button></div>
      )}
    </div>
  );
}
