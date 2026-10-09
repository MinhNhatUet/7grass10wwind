import { ShieldAlert } from "lucide-react";

interface WarningBubbleProps {
  title: string;
  message: string;
}

export function WarningBubble({ title, message }: WarningBubbleProps) {
  return (
    <div className="flex gap-3.5 bg-amber-500/[0.08] dark:bg-amber-400/[0.08] border border-amber-500/25 dark:border-amber-400/20 text-amber-800 dark:text-amber-300 rounded-2xl px-4.5 py-3.5 mt-3 w-full shadow-xs backdrop-blur-xs">
      <div className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400">
        <ShieldAlert size={18} />
      </div>
      <div className="flex flex-col gap-1">
        <strong className="text-[13px] font-semibold tracking-tight text-amber-900 dark:text-amber-200">{title}</strong>
        <p className="text-[12.5px] leading-relaxed text-amber-800/90 dark:text-amber-300/90 m-0">{message}</p>
      </div>
    </div>
  );
}
