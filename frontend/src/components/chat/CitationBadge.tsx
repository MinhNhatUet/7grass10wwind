import { FileText } from "lucide-react";
import type { Source } from "@/types/chat";

interface CitationBadgeProps {
  source: Source;
  onClick: (source: Source) => void;
}

export function CitationBadge({ source, onClick }: CitationBadgeProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(source)}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary/50 hover:bg-secondary text-secondary-foreground border border-border text-[11px] font-medium transition-colors cursor-pointer align-middle mx-1"
      title={source.title}
    >
      <FileText size={10} className="opacity-70" />
      <span>[{source.id}]</span>
    </button>
  );
}
