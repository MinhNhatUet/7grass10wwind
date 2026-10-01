"use client";

import type { Citation } from "@/lib/api";

/** Chip [n]: rê chuột xem nhanh đoạn trích + trang; bấm mở nguồn tại đúng đoạn (kiểu NotebookLM). */
export function CiteChip({ c, onOpen }: { c: Citation; onOpen: (c: Citation) => void }) {
  return (
    <span className="cite-wrap">
      <button type="button" className="cite" onClick={() => onOpen(c)} aria-label={`Mở nguồn [${c.id}]`}>
        {c.id}
      </button>
      <span className="cite-card" role="tooltip">
        <span className="cite-card-loc">
          {c.locator.type === "page" ? "Trang" : "Slide"} {c.locator.value}
        </span>
        {c.quote.length > 280 ? `${c.quote.slice(0, 280)}…` : c.quote}
      </span>
    </span>
  );
}

/** Các chip nguồn cho một mục (thẻ, định nghĩa…) theo số [n] của câu trả lời. */
export function SourceChips({
  ns,
  citations,
  onCitation,
}: {
  ns: number[];
  citations: Citation[];
  onCitation: (c: Citation) => void;
}) {
  const byOrdinal = new Map(citations.map((c) => [Number(c.id), c]));
  return (
    <>
      {ns.map((n) => {
        const c = byOrdinal.get(n);
        return c ? <CiteChip key={n} c={c} onOpen={onCitation} /> : null;
      })}
    </>
  );
}
