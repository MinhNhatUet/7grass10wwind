"use client";
// Một tin nhắn chat (giao diện nhánh quanghung, D-53) + tính năng đang chạy: thẻ học (D-30/D-37), KaTeX (D-40),
// ẩn nguồn khi vừa tạo đề / lộ trình rồi hiện dẫn chứng sau khi trả lời, khoảng trang trích dẫn (D-50).
import { motion } from "framer-motion";
import { Zap, ThumbsUp, ThumbsDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, Source } from "@/types/chat";
import type { HubResult } from "@/lib/api";
import { MathP, citesOutOfMath, mathDelims, rehypeMathPlugins, remarkMathPlugins } from "@/components/math-text";
import { HIDE_SOURCE_KINDS, LearningCards, noCite } from "@/components/learning-cards";
import { CitationBadge } from "./CitationBadge";
import { WarningBubble } from "./WarningBubble";
import { useState } from "react";

interface ChatMessageProps {
  msg: Message;
  onSourceClick: (source: Source) => void;
  onSubmitFeedback: (msgId: string, type: string) => void;
  /** Thẻ học cần tải lại hội thoại (đã nộp bài, đổi trạng thái lộ trình…) */
  onChanged: () => void;
  /** Thẻ học gửi yêu cầu mới (ôn tập theo buổi, tạo lại…) */
  onSend: (content: string, body: Record<string, unknown>) => void;
}


// [n] / [1, 3] trong câu trả lời → link "#cite-n" để render thành badge có đoạn trích (D-55).
// Không đụng chỉ số mảng dính liền tên biến/ngoặc tròn (a[1], f(x)[2]).
const CITE_RE = /(?<![\w)])\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g; // cho phép chuỗi [1][2]
// href "#cite-n-k": lần xuất hiện thứ k của [n] — khớp thứ tự với payload.evidence do backend tính (D-56)
function linkCites(text: string, ids: Set<string>): string {
  const seen: Record<string, number> = {};
  return text.replace(CITE_RE, (all, list: string) => {
    const ns = list.split(",").map((x) => x.trim());
    if (!ns.every((n) => ids.has(n))) return all;
    return ns.map((n) => { const k = seen[n] ?? 0; seen[n] = k + 1; return `[${n}](#cite-${n}-${k})`; }).join("");
  });
}

type Evidence = Record<string, { quote: string; page: number; page_end?: number }[]>; // D-70: page_end khi đoạn trải nhiều trang

/** D-67: số hiển thị theo ĐOẠN dẫn chứng (nguồn + trang + đoạn trích), đánh 1, 2, 3… theo thứ tự xuất hiện — một nguồn
 *  trải nhiều trang/ý không còn hiện toàn "1"; trích lại đúng đoạn cũ thì dùng lại số cũ. Khóa "n-k" như href #cite-n-k. */
function citeLabels(text: string, ids: Set<string>, evidence: Evidence | undefined): Record<string, number> {
  const seen: Record<string, number> = {};
  const byPlace: Record<string, number> = {};
  const out: Record<string, number> = {};
  for (const m of text.matchAll(CITE_RE)) {
    const ns = m[1].split(",").map((x) => x.trim());
    if (!ns.every((n) => ids.has(n))) continue;
    for (const n of ns) {
      const k = seen[n] ?? 0;
      seen[n] = k + 1;
      const ev = evidence?.[n]?.[k];
      const place = `${n}@${ev?.page ?? ""}@${ev?.quote.slice(0, 80) ?? ""}`;
      byPlace[place] ??= Object.keys(byPlace).length + 1;
      out[`${n}-${k}`] = byPlace[place];
    }
  }
  return out;
}

export function ChatMessage({ msg, onSourceClick, onSubmitFeedback, onChanged, onSend }: ChatMessageProps) {
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const hideSources = HIDE_SOURCE_KINDS.includes(msg.meta?.kind ?? "");
  const sourceIds = new Set((msg.sources ?? []).map((x) => String(x.id)));
  const content = citesOutOfMath(msg.content); // [n] lẫn trong công thức → ra ngoài trước khi đánh số/gắn link
  const labels = citeLabels(content, sourceIds, (msg.meta as { evidence?: Evidence } | undefined)?.evidence);
  // Có nguồn nhưng câu trả lời không gắn [n] nào → vẫn cho xem nguồn bằng hàng chip nhỏ (không mất nguồn)
  const unlinked = !hideSources && !!msg.sources?.length && !linkCites(content, sourceIds).includes("](#cite-");

  const handleFeedback = (type: string) => {
    setFeedbackSent(type);
    onSubmitFeedback(msg.id, type);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {msg.role === 'assistant' && (
        <div className="w-[32px] h-[32px] shrink-0 rounded-full bg-primary flex items-center justify-center mt-1 shadow-sm">
          <Zap size={16} className="text-primary-foreground" />
        </div>
      )}

      <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-secondary text-secondary-foreground rounded-[24px] px-5 py-3' : 'bg-transparent border border-border text-foreground rounded-[24px] px-5 py-4 shadow-sm relative overflow-hidden'}`}>

        {/* Ambient glow effect for assistant messages (Glassmorphism hint) */}
        {msg.role === 'assistant' && (
           <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        )}

        <div className="relative z-10">
          {msg.agentName && (
            <div className="text-[12px] font-semibold text-primary mb-2 uppercase tracking-wide">
              {msg.agentName}
            </div>
          )}

          {msg.role === 'user' ? (
            <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed prose-p:mb-4 prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, ...remarkMathPlugins]}
                rehypePlugins={rehypeMathPlugins}
                components={{
                  p: MathP,
                  a: ({node, ...props}) => {
                    const m = props.href?.match(/^#cite-(\d+)-(\d+)$/);
                    const cite = m ? msg.sources?.find((s) => String(s.id) === m[1]) : undefined;
                    if (m && cite) {
                      // đoạn trích riêng của câu này (nếu có), không thì đoạn trích chung của nguồn
                      const ev = (msg.meta as { evidence?: Evidence } | undefined)?.evidence?.[m[1]]?.[Number(m[2])];
                      const shown = ev ? { ...cite, content: ev.quote, page: ev.page, pageEnd: ev.page_end ?? null } : cite;
                      return <CitationBadge source={shown} onClick={onSourceClick} label={labels[`${m[1]}-${m[2]}`]} />;
                    }
                    return (
                      <a
                        {...props}
                        onClick={() => {
                          if (props.href) {
                            window.open(props.href, '_blank');
                          }
                        }}
                        className="cursor-pointer font-medium text-primary"
                      />
                    );
                  }
                }}
              >
                {mathDelims(hideSources ? noCite(content) : linkCites(content, sourceIds), true)}
              </ReactMarkdown>
            </div>
          )}

          {/* Academic Integrity Warning (Example detection) */}
          {msg.role === 'assistant' && msg.content.toLowerCase().includes("làm hộ") && (
            <WarningBubble
              title="Cảnh báo Liêm chính học thuật"
              message="Yêu cầu làm bài tập hộ vi phạm quy chế Đào tạo. AI chỉ cung cấp hướng dẫn phương pháp giải."
            />
          )}

          {msg.role === 'assistant' && (
            <LearningCards
              meta={msg.meta}
              messageId={msg.id}
              onSource={onSourceClick}
              onChanged={onChanged}
              onSend={onSend}
              onOpenHub={(r: HubResult) => onSourceClick({ id: r.chunk_id, title: r.title, page: r.locator.value, content: r.snippet, documentId: r.document_id, versionId: r.version_id })}
              sources={msg.sources}
            />
          )}

          {/* Nguồn nằm ngay tại [n] trong câu trả lời (D-55); đề / lộ trình vừa tạo không hiện nguồn (dẫn chứng hiện sau khi trả lời) */}
          {msg.role === 'assistant' && unlinked && (
            <div aria-label="Nguồn" className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground">
              Nguồn: {msg.sources!.map((source) => <CitationBadge key={source.id} source={source} onClick={onSourceClick} />)}
            </div>
          )}

          {msg.role === 'assistant' && (
            <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-2">
              <button
                onClick={() => handleFeedback("helpful")}
                className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${feedbackSent === 'helpful' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
                title="Hữu ích"
              >
                <ThumbsUp size={14} className={feedbackSent === 'helpful' ? 'fill-current' : ''} />
              </button>
              <button
                onClick={() => handleFeedback("not_helpful")}
                className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${feedbackSent === 'not_helpful' ? 'text-red-500' : 'text-muted-foreground'}`}
                title="Không hữu ích"
              >
                <ThumbsDown size={14} className={feedbackSent === 'not_helpful' ? 'fill-current' : ''} />
              </button>
              {feedbackSent && (
                <motion.span initial={{opacity: 0, x: -5}} animate={{opacity: 1, x: 0}} className="text-[11px] text-muted-foreground ml-1 font-medium">Đã gửi phản hồi</motion.span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
