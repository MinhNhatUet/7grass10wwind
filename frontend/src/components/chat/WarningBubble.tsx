import { ShieldAlert } from "lucide-react";

interface WarningBubbleProps {
  title: string;
  message: string;
}

export function WarningBubble({ title, message }: WarningBubbleProps) {
  return (
    <div className="flex gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-2xl px-4 py-3 mt-3 w-full">
      <div className="shrink-0 mt-0.5">
        <ShieldAlert size={18} />
      </div>
      <div className="flex flex-col gap-1">
        <strong className="text-[13px] font-semibold">{title}</strong>
        <p className="text-[13px] leading-relaxed opacity-90 m-0">{message}</p>
      </div>
    </div>
  );
}
