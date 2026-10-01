"use client";
// Một tin nhắn chat (giao diện nhánh quanghung, D-53) + tính năng đang chạy: thẻ học (D-30/D-37), KaTeX (D-40),
// ẩn nguồn khi vừa tạo đề / lộ trình rồi hiện dẫn chứng sau khi trả lời, khoảng trang trích dẫn (D-50).
import { motion } from "framer-motion";
import { Zap, ThumbsUp, ThumbsDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, Source } from "@/types/chat";
import type { HubResult } from "@/lib/api";
import { mathDelims, rehypeMathPlugins, remarkMathPlugins } from "@/components/math-text";
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

const pages = (s: Source) => `${s.page}${s.pageEnd && s.pageEnd !== s.page ? `–${s.pageEnd}` : ""}`;

export function ChatMessage({ msg, onSourceClick, onSubmitFeedback, onChanged, onSend }: ChatMessageProps) {
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const hideSources = HIDE_SOURCE_KINDS.includes(msg.meta?.kind ?? "");

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
                  a: ({node, ...props}) => {
                    const matchedSource = msg.sources?.find(s => s.url === props.href);
                    if (matchedSource) {
                      return <CitationBadge source={matchedSource} onClick={onSourceClick} />;
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
                {mathDelims(hideSources ? noCite(msg.content) : msg.content)}
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
              onCite={(n) => { const src = msg.sources?.find((x) => String(x.id) === String(n)); if (src) onSourceClick(src); }}
              onChanged={onChanged}
              onSend={onSend}
              onOpenHub={(r: HubResult) => onSourceClick({ id: r.chunk_id, title: r.title, page: r.locator.value, content: r.snippet, documentId: r.document_id, versionId: r.version_id })}
              sources={msg.sources}
            />
          )}

          {/* Đề / lộ trình vừa tạo: KHÔNG hiện nguồn; dẫn chứng hiện trong thẻ sau khi người học trả lời */}
          {msg.role === 'assistant' && !!msg.sources?.length && !hideSources && (
            <section aria-label="Nguồn tham khảo" className="mt-4 border-t border-border/50 pt-3">
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Nguồn tham khảo</h3>
              <ul className="space-y-1.5 list-none pl-0">
                {msg.sources.map((source) => (
                  <li key={source.id} className="m-0">
                    <button type="button" onClick={() => onSourceClick(source)} className="w-full text-left rounded-lg p-2.5 bg-secondary/30 hover:bg-secondary/80 border border-transparent hover:border-border transition-all cursor-pointer">
                      <span className="block text-[13px] font-medium text-foreground">[{source.id}] {source.title} — Trang {pages(source)}</span>
                      {source.content && <span className="block text-[12px] mt-1 text-muted-foreground whitespace-pre-wrap line-clamp-2">“{source.content}”</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
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
