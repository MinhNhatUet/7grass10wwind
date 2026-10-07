// Tag "Đang ôn" (D-83): phần người học vừa bấm ôn — bước của lộ trình theo tiến độ hoặc buổi của lộ trình theo ngày —
// được ghim lên thanh trên cùng (cả trong chat) để quay lại hoặc đổi sang phần khác bằng một chạm.
// Chỉ lưu trên trình duyệt của người học (theo tài khoản), là lối tắt điều hướng — không phải dữ liệu học tập: nội dung
// học vẫn do server trả và kiểm quyền mỗi lần gửi (BR-02/03).

import { useSyncExternalStore } from "react";

export type PinAction = { type: string; label: string };
export type StudyPin = {
  key: string; // "path:<lộ trình>:<bước>" | "plan:<lộ trình>:<buổi>"
  source: "path" | "plan";
  title: string;
  subtitle: string; // tên lộ trình
  courseId?: string;
  topic: string; // chủ đề gửi trợ lý học tập khi bấm hoạt động
  concepts?: string[]; // khái niệm gợi ý để nhờ giải thích
  actions: PinAction[];
  extra?: Record<string, unknown>; // tham số thêm cho yêu cầu học (vd. plan_id để server lấy môn của lộ trình)
  href: string; // mở lại đúng chỗ trong trang Lộ trình học
  pinnedAt: number;
};

const MAX_PINS = 8;
const EVENT = "edu04:study-pins-changed";
const EMPTY: StudyPin[] = [];

function storageKey(): string {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return `edu04:study-pins:${user?.id ?? "anon"}`;
  } catch {
    return "edu04:study-pins:anon";
  }
}

let cacheRaw: string | null = null;
let cacheValue: StudyPin[] = EMPTY;

function read(): StudyPin[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey());
  } catch {
    return EMPTY;
  }
  if (raw !== cacheRaw) { // giữ cùng tham chiếu khi không đổi (useSyncExternalStore)
    cacheRaw = raw;
    try {
      const parsed = JSON.parse(raw || "[]");
      cacheValue = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cacheValue = EMPTY;
    }
  }
  return cacheValue;
}

function write(pins: StudyPin[]): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(pins.slice(0, MAX_PINS)));
  } catch {
    /* storage bị chặn → không ghim được, học vẫn bình thường */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Ghim (hoặc đưa lên đầu nếu đã ghim) — phần mới nhất là phần "đang ôn". */
export function pinStudy(pin: Omit<StudyPin, "pinnedAt">): void {
  write([{ ...pin, pinnedAt: Date.now() }, ...read().filter((p) => p.key !== pin.key)]);
}

export function unpinStudy(key: string): void {
  write(read().filter((p) => p.key !== key));
}

/** Bỏ mọi ghim có key bắt đầu bằng `prefix` (vd. xóa lộ trình → bỏ ghim mọi bước "path:<id>:"). */
export function unpinPrefix(prefix: string): void {
  write(read().filter((p) => !p.key.startsWith(prefix)));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // tab khác ghim/bỏ ghim
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStudyPins(): StudyPin[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
