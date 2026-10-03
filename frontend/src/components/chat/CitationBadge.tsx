"use client";
// Số trích dẫn [n] NGAY TRONG câu trả lời (D-55): rê chuột / chạm hiện đoạn trích + tài liệu + trang; bấm mở trang nguồn.
import * as HoverCard from "@radix-ui/react-hover-card";
import { ExternalLink, FileText } from "lucide-react";
import type { Source } from "@/types/chat";

interface CitationBadgeProps {
  source: Source;
  onClick: (source: Source) => void;
}

const pages = (s: Source) => `${s.page}${s.pageEnd && s.pageEnd !== s.page ? `–${s.pageEnd}` : ""}`;

export function CitationBadge({ source, onClick }: CitationBadgeProps) {
  return (
    <HoverCard.Root openDelay={120} closeDelay={150}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          onClick={() => onClick(source)}
          aria-label={`Nguồn ${source.id}: ${source.title}, trang ${pages(source)}`}
          className="inline-flex items-center justify-center min-w-[1.4rem] h-[1.15rem] px-1 mx-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold leading-none align-[0.15em] cursor-pointer border-0 transition-colors"
        >
          {source.id}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="top" align="center" sideOffset={6} collisionPadding={12}
          className="z-50 font-sans w-[min(380px,90vw)] rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl p-3 text-[13px]">
          <p className="m-0 flex items-start gap-2 font-semibold leading-snug">
            <FileText size={14} className="mt-0.5 shrink-0 opacity-70" />
            <span>{source.title} <span className="font-normal text-muted-foreground">· trang {pages(source)}</span></span>
          </p>
          {source.content && (
            <p className="m-0 mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground max-h-64 overflow-y-auto border-l-2 border-primary/40 pl-2">“{source.content}”</p>
          )}
          <button type="button" onClick={() => onClick(source)}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline">
            <ExternalLink size={12} /> Mở trang nguồn
          </button>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
