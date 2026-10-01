"use client";

import { useState } from "react";
import { SourceChips } from "@/components/CiteChip";
import type { Citation, StudyItem, TriageSections } from "@/lib/api";

// Công cụ học chủ động (D-30): nút bắt đầu nhanh, flashcard, điền khuyết, chế độ cấp cứu.
// Nội dung và nguồn đều do backend tạo + kiểm tra; UI chỉ hiển thị và cho người học tương tác.

const QUICK: ({ icon: string; label: string; desc: string } & ({ send: string } | { fill: string }))[] = [
  {
    icon: "🧭",
    label: "Tôi không biết bắt đầu từ đâu",
    desc: "3 câu chẩn đoán nhanh",
    send: "Tôi mới học, không biết bắt đầu từ đâu — kiểm tra nhanh kiến thức nền giúp mình",
  },
  { icon: "🃏", label: "Tạo flashcard", desc: "Thẻ ghi nhớ có nguồn", fill: "Tạo flashcard về " },
  { icon: "✏️", label: "Bài điền khuyết", desc: "Tự điền rồi chấm", fill: "Tạo bài điền khuyết về " },
  { icon: "💡", label: "Giải thích bằng ví dụ đời thường", desc: "Ẩn dụ dễ nhớ", fill: "Giải thích … bằng ví dụ về " },
  { icon: "🚑", label: "Cấp cứu: sắp thi", desc: "Định nghĩa, lỗi hay gặp, ví dụ", fill: "Mai thi phần …, ôn cấp tốc giúp mình" },
];

/** Gửi thẳng cho router hoặc điền sẵn câu mẫu — không phải chip chọn trợ lý (router vẫn quyết định, D-28). */
export function QuickActions({
  onSend,
  onFill,
  compact,
}: {
  onSend: (t: string) => void;
  onFill: (t: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`quick-actions${compact ? " compact" : ""}`}>
      {QUICK.map((q) => (
        <button key={q.label} type="button" className="quick" onClick={() => ("send" in q ? onSend(q.send) : onFill(q.fill))}>
          <span className="quick-icon" aria-hidden="true">
            {q.icon}
          </span>
          <span className="quick-text">
            <span className="quick-label">{q.label}</span>
            {!compact && <span className="quick-desc">{q.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

interface CardsProps {
  items: StudyItem[];
  citations: Citation[];
  onCitation: (c: Citation) => void;
}

/** Thẻ ghi nhớ: tự nhớ lại trước, bấm để lật (active recall). */
export function FlashcardDeck({ items, citations, onCitation }: CardsProps) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const card = items[i];
  const go = (d: number) => {
    setI((i + d + items.length) % items.length);
    setFlipped(false);
  };
  return (
    <div className="card-inline flashcards">
      <button type="button" className={`flashcard${flipped ? " flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
        <span className="muted small">{flipped ? "Đáp án" : "Tự nhớ lại, rồi bấm để lật thẻ"}</span>
        <span className="flashcard-text">{flipped ? card.back : card.front}</span>
      </button>
      <div className="row between">
        <span className="small">
          Thẻ {i + 1}/{items.length} · đã nhớ {known.size} · nguồn{" "}
          <SourceChips ns={card.sources} citations={citations} onCitation={onCitation} />
        </span>
        <span className="row">
          <button type="button" className="btn-secondary" onClick={() => go(-1)} aria-label="Thẻ trước">
            ‹
          </button>
          {flipped && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setKnown(new Set(known).add(i));
                go(1);
              }}
            >
              Đã nhớ
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => go(1)} aria-label="Thẻ sau">
            ›
          </button>
        </span>
      </div>
    </div>
  );
}

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

/** Bài điền khuyết: tự điền rồi kiểm tra; đáp án là cụm từ nguyên văn trong nguồn. */
export function ClozeCard({ items, citations, onCitation }: CardsProps) {
  const [vals, setVals] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const correct = items.filter((it, k) => norm(vals[k] ?? "") === norm(it.answer ?? "")).length;
  return (
    <div className="card-inline">
      {items.map((it, k) => {
        const [before, ...rest] = (it.sentence ?? "").split("____");
        const ok = norm(vals[k] ?? "") === norm(it.answer ?? "");
        return (
          <div key={k} className="cloze-item">
            <span>
              {k + 1}. {before}
            </span>
            <input
              className={`cloze-input${checked ? (ok ? " ok" : " wrong") : ""}`}
              value={vals[k] ?? ""}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
              aria-label={`Chỗ trống câu ${k + 1}`}
            />
            <span>{rest.join("____")}</span> <SourceChips ns={it.sources} citations={citations} onCitation={onCitation} />
            {it.hint && !checked && <div className="muted small">Gợi ý: {it.hint}</div>}
            {checked && !ok && <div className="small warn">Đáp án: {it.answer}</div>}
          </div>
        );
      })}
      <div className="row">
        <button type="button" onClick={() => setChecked(true)}>
          Kiểm tra
        </button>
        {checked && (
          <>
            <span className="small">
              Đúng {correct}/{items.length}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setVals({});
                setChecked(false);
              }}
            >
              Làm lại
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Chế độ cấp cứu: đúng 3 phần, mọi mục có nguồn; không có lưu ý trong tài liệu thì ghi rõ. */
export function TriageCard({
  sections,
  notes,
  citations,
  onCitation,
}: {
  sections: TriageSections;
  notes: string[];
  citations: Citation[];
  onCitation: (c: Citation) => void;
}) {
  return (
    <div className="card-inline triage">
      <h4>1. Định nghĩa bắt buộc phải thuộc</h4>
      <ul>
        {sections.definitions.map((d, k) => (
          <li key={k}>
            {d.term && <strong>{d.term}: </strong>}
            {d.text} <SourceChips ns={d.sources} citations={citations} onCitation={onCitation} />
          </li>
        ))}
      </ul>
      <h4>2. Sai lầm / lưu ý cần tránh</h4>
      {sections.pitfalls.length === 0 ? (
        <p className="muted small">Tài liệu không nêu rõ — không tự bịa thêm.</p>
      ) : (
        <ul>
          {sections.pitfalls.map((p, k) => (
            <li key={k}>
              {p.text} <SourceChips ns={p.sources} citations={citations} onCitation={onCitation} />
            </li>
          ))}
        </ul>
      )}
      <h4>3. Ví dụ cốt lõi</h4>
      <ol>
        {sections.examples.map((e, k) => (
          <li key={k}>
            {e.title && <strong>{e.title}. </strong>}
            {e.text} <SourceChips ns={e.sources} citations={citations} onCitation={onCitation} />
          </li>
        ))}
      </ol>
      {notes.map((n, k) => (
        <div key={k} className="warn small">
          ⚠ {n}
        </div>
      ))}
    </div>
  );
}
