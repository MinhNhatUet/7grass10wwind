"use client";

// Thanh "Đang ôn" (D-83): các phần đã bấm ôn ở Lộ trình học (theo tiến độ hoặc theo ngày) được ghim thành tag ở đầu
// khung — cả khi đang trong chat — để đổi sang phần khác hoặc quay lại đúng chỗ trong lộ trình bằng một chạm.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pin, X } from "lucide-react";
import { goToChat } from "@/components/learning-hub";
import { COUNTED_ACTIONS, CountPicker } from "@/components/count-picker";
import { pinStudy, unpinStudy, useStudyPins, type StudyPin } from "@/lib/study-pins";

const CHAT_ACTIONS = new Set(["explain", "quiz", "mcq", "flashcards", "cloze"]);
const chip = "rounded-full px-3 py-1 text-[12px] cursor-pointer border border-black/10 dark:border-white/15 bg-transparent hover:bg-black/5 dark:hover:bg-white/10";

/** Gửi hoạt động học của một tag vào chat (đang ở chat thì gửi ngay trong hội thoại hiện tại). */
export function studyFromPin(router: ReturnType<typeof useRouter>, pin: StudyPin, type: string, label: string, topic?: string, count?: number) {
  pinStudy(pin); // phần vừa ôn lên đầu
  if (type === "find") {
    const content = `Tìm tài liệu học về ${pin.title}`;
    return goToChat(router, content, { content, assistant: "hub" }, pin.courseId);
  }
  const content = `${pin.title} — ${label}${count ? ` (${count} ${type === "flashcards" ? "thẻ" : "câu"})` : ""}`;
  goToChat(router, content, { content, assistant: "learning", learning: { action: type, topic: (topic ?? pin.topic).slice(0, 600), ...(count ? { count } : {}), ...pin.extra } }, pin.courseId);
}

export function StudyPinsBar() {
  const router = useRouter();
  const pins = useStudyPins();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [counting, setCounting] = useState<{ type: string; label: string } | null>(null); // hình thức đang chọn số câu
  const open = pins.find((p) => p.key === openKey) ?? null;
  if (!pins.length) return null;
  return (
    <div className="shrink-0 border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-[#0c1219]/80 backdrop-blur px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2 overflow-x-auto" role="toolbar" aria-label="Phần đang ôn">
        <span className="flex shrink-0 items-center gap-1 font-medium text-black/60 dark:text-white/60"><Pin size={14} /> Đang ôn</span>
        {pins.map((p, i) => (
          <span key={p.key} className={`flex shrink-0 items-center rounded-full border ${p.key === openKey ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : i === 0 ? "border-black/40 dark:border-white/40" : "border-black/10 dark:border-white/15"}`}>
            <button type="button" aria-expanded={p.key === openKey} title={`${p.subtitle} — ${p.title}`}
              onClick={() => { setOpenKey(p.key === openKey ? null : p.key); setExplaining(false); setCounting(null); }}
              className="max-w-[220px] truncate cursor-pointer border-0 bg-transparent py-1 pl-3 pr-1 text-inherit">
              {p.source === "plan" ? "📅 " : "🧭 "}{p.title}
            </button>
            <button type="button" aria-label={`Bỏ ghim ${p.title}`} onClick={() => { unpinStudy(p.key); if (openKey === p.key) setOpenKey(null); }}
              className="cursor-pointer border-0 bg-transparent py-1 pl-1 pr-2 text-inherit opacity-60 hover:opacity-100"><X size={12} /></button>
          </span>
        ))}
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-black/10 dark:border-white/10 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{open.title}</p>
              <p className="text-[12px] text-black/50 dark:text-white/50">{open.source === "plan" ? "Lộ trình theo ngày" : "Lộ trình theo tiến độ"} · {open.subtitle}</p>
            </div>
            <Link href={open.href} onClick={() => setOpenKey(null)} className={`${chip} no-underline text-inherit`}>Mở trong lộ trình →</Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {open.actions.filter((a) => a.type === "find" || CHAT_ACTIONS.has(a.type)).map((a, i) => (
              <button key={i} type="button" className={`${chip} ${counting?.type === a.type ? "border-[#4f2b96] text-[#4f2b96]" : ""}`} aria-pressed={counting?.type === a.type}
                onClick={() => (a.type === "explain" && open.concepts?.length ? (setCounting(null), setExplaining(!explaining))
                  : COUNTED_ACTIONS.has(a.type) ? (setExplaining(false), setCounting({ type: a.type, label: a.label }))
                  : (setOpenKey(null), studyFromPin(router, open, a.type, a.label)))}>
                {a.type === "find" ? "🔎 " : ""}{a.label}{a.type === "explain" && open.concepts?.length ? (explaining ? " ▴" : " ▾") : ""}
              </button>
            ))}
          </div>
          {counting && (
            <CountPicker action={counting.type} onCancel={() => setCounting(null)}
              onConfirm={(n) => { const c = counting; setCounting(null); setOpenKey(null); studyFromPin(router, open, c.type, c.label, undefined, n); }} />
          )}
          {explaining && !!open.concepts?.length && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="w-full text-[12px] text-black/50 dark:text-white/50">Chọn khái niệm để trợ lý giải thích từng bước:</span>
              {open.concepts.map((c) => (
                <button key={c} type="button" className={chip}
                  onClick={() => { setOpenKey(null); setExplaining(false); studyFromPin(router, open, "explain", `Giải thích: ${c}`, `${c} (chủ đề: ${open.title})`); }}>{c}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
