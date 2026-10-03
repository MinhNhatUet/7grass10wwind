"use client";
import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ACTIVE_CONV, CONV_CHANGED } from "@/components/main-shell";
import { ArrowUp, Zap, FileText, Plus, X, ChevronRight, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SourceReader from "@/components/source-reader";
import { API, responseError } from "@/lib/api-errors";
import { PENDING_SEND, QuickStart } from "@/components/learning-cards";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type { Message, Source } from "@/types/chat";
import type { ChatMessage as ApiMessage, Citation } from "@/lib/api";

// Router chọn trợ lý (FR-11, D-27): không ép "academic"; nhãn hiển thị theo trợ lý router đã chọn
/** Citation của API → nguồn hiển thị (trang / khoảng trang D-50). */
const toSource = (c: Citation): Source => ({
  id: c.id,
  citationId: c.citation_id, documentId: c.document_id, versionId: c.version_id,
  title: c.document_title || `Tài liệu ${c.document_id}`,
  page: c.locator?.value ?? 1, pageEnd: c.locator?.end ?? null,
  content: c.quote || "",
  url: `${API}/documents/${c.document_id}/versions/${c.version_id}/download`,
});

const AGENT: Record<string, string> ={ academic: "Academic Assistant", learning: "Learning Assistant", hub: "Knowledge Hub", router: "EDU-04" };


export default function ChatPage() {
  return <Suspense fallback={null}><UnifiedChat /></Suspense>;
}

function UnifiedChat() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [documentScope, setDocumentScope] = useState<{ id: string; title: string } | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;


  // Feedback state


  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ── Send feedback ──────────────────────────────────────────
  const submitFeedback = async (msgId: string, type: string) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await fetch(`${API}/answers/${msgId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, share_content: false })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const loadConversation = async (convId: string) => {
    if (isLoading || conversationLoading) return;
    setConversationLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const loadedMessages: Message[] = (data.items as ApiMessage[]).map((m) => ({
          id: m.message_id,
          role: m.role,
          content: m.content,
          agentName: m.role === 'assistant' ? AGENT[m.assistant ?? ""] ?? 'EDU-04' : undefined,
          meta: m.metadata,
          sources: m.citations?.map(toSource) || []
        }));
        const detail = await fetch(`${API}/conversations/${convId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!detail.ok) throw await responseError(detail);
        const conversation = await detail.json();
        setDocumentScope(conversation.document_id ? { id: conversation.document_id, title: conversation.title } : null);
        window.history.replaceState(null, "", "/");
        setMessages(loadedMessages);
        setActiveConversationId(convId);
        setActiveSource(null);
      }
    } catch (err) {
      console.error("Failed to load conversation", err);
    } finally {
      setConversationLoading(false);
    }
  };


  // Thanh bên điều hướng bằng URL (D-54): ?conv= mở hội thoại, ?new= chat mới, ?q= điền sẵn câu, ?document= hỏi về 1 tài liệu
  const searchParams = useSearchParams();
  useEffect(() => {
    const conv = searchParams.get("conv");
    const doc = searchParams.get("document");
    const q = searchParams.get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đồng bộ trạng thái chat theo URL do thanh bên đặt
    if (conv) void loadConversation(conv);
    else if (searchParams.get("new") || doc) {
      setMessages([]); setActiveSource(null); setActiveConversationId(null);
      setDocumentScope(doc ? { id: doc, title: searchParams.get("title") || "Tài liệu đã chọn" } : null);
      if (searchParams.get("new")) window.history.replaceState(null, "", "/");
    }
    if (q) setPrompt(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi URL đổi
  }, [searchParams]);

  // Thanh bên tô hội thoại đang mở
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(ACTIVE_CONV, { detail: activeConversationId }));
  }, [activeConversationId]);

  const handleSend = async (e?: React.FormEvent, override?: { content: string; body: Record<string, unknown>; courseId?: string }) => {
    if (e) e.preventDefault();
    const text = override?.content ?? prompt;
    if (!text.trim() || isLoading || conversationLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages(prev => [...prev, userMessage]);
    const payload = override?.body ?? { content: text };
    if (!override) setPrompt("");
    setIsLoading(true);
    setActiveSource(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
      
      let convId = activeConversationId;
      if (!convId) {
        const convRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/conversations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ document_id: documentScope?.id, course_id: override?.courseId })
        });
        if (convRes.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
          return;
        }
        if (!convRes.ok) throw await responseError(convRes);
        if (convRes.ok) {
          const convData = await convRes.json();
          convId = convData.conversation_id || convData.id;
          setActiveConversationId(convId);
          window.dispatchEvent(new Event(CONV_CHANGED)); // thanh bên tải lại lịch sử
        }
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/conversations/${convId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      
      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw await responseError(response);
      }
      
      const data = await response.json();
      
      const assistantMessage: Message = {
        id: data.message_id || data.id || (Date.now() + 1).toString(),
        role: "assistant",
        agentName: AGENT[data.assistant] ?? "EDU-04",
        content: data.content,
        meta: data.metadata,
        sources: (data.citations as Citation[] | undefined)?.map(toSource) || []
      };
      setMessages(prev => [...prev, assistantMessage]);
      window.dispatchEvent(new Event(CONV_CHANGED)); // thanh bên cập nhật tiêu đề hội thoại
    } catch (err) {
      console.error(err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Không thể kết nối máy chủ. Vui lòng thử lại."
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Từ Learning / Lộ trình (D-45): trang đó chuyển sang ngay, chat tự gửi yêu cầu và hiện "đang trả lời".
  // Xoá khỏi sessionStorage trước khi gửi → StrictMode chạy effect 2 lần cũng không gửi trùng.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("pending")) return;
    let pending: string | null = null;
    try { pending = sessionStorage.getItem(PENDING_SEND); sessionStorage.removeItem(PENDING_SEND); } catch { /* storage bị chặn */ }
    window.history.replaceState(null, "", "/");
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gửi yêu cầu một lần khi mở trang, như người dùng bấm Gửi
    try { void handleSend(undefined, JSON.parse(pending)); } catch { /* dữ liệu hỏng → bỏ qua */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần khi mở trang
  }, []);

  return (
    <div className="flex h-full bg-white dark:bg-[#081018] text-black dark:text-[#f7f7f8] font-sans overflow-hidden isolate relative">
      
      <div className="hidden dark:block fixed inset-0 z-[-2] pointer-events-none" style={{ background: 'radial-gradient(circle at 72% 47%, rgba(255,180,112,.14), transparent 28%), linear-gradient(180deg, rgba(5,10,16,.34), rgba(3,7,12,.43) 55%, rgba(3,7,12,.63))' }} />
      <div className="block dark:hidden fixed inset-0 z-[-2] pointer-events-none bg-white/20" />

      <section className="flex-1 flex flex-col relative min-w-0 h-full overflow-hidden">
        
        <div className="h-[60px] shrink-0" aria-hidden="true" />

        {documentScope && (
          <div className="w-full shrink-0 px-4 pb-2 pt-2 sm:px-8">
            <section aria-label="Phạm vi hỏi đáp" className="mx-auto flex max-w-[768px] flex-wrap items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/85 px-3.5 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#151619]/85">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:bg-[#c69aff]/10 dark:text-[#c69aff]" aria-hidden="true"><FileText size={19} strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-black/50 dark:text-white/50"><span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-[#c69aff]" aria-hidden="true" />Đang hỏi đáp trong tài liệu</p>
                <p title={documentScope.title} className="truncate text-[13px] font-semibold leading-5 text-black/85 dark:text-white/85">{documentScope.title}</p>
              </div>
              <button
                disabled={isLoading || conversationLoading}
                title="Bắt đầu cuộc trò chuyện mới với tất cả tài liệu được phép đọc"
                onClick={() => { setDocumentScope(null); setMessages([]); setActiveConversationId(null); setActiveSource(null); window.history.replaceState(null, "", "/"); }}
                className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.06] bg-black/[0.03] px-3 py-2 text-[12px] font-medium text-black/60 transition-colors hover:bg-black/[0.07] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <BookOpen size={14} aria-hidden="true" />Tất cả tài liệu<ChevronRight size={13} aria-hidden="true" />
              </button>
            </section>
          </div>
        )}
        {conversationLoading && <p role="status" className="px-4 text-sm">Đang tải hội thoại…</p>}
        {/* BODY - Morphing Layout */}
        <div className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
          
          {/* Spacer for vertical centering when no messages */}
          <motion.div 
            layout
            initial={false}
            animate={{ flexGrow: hasMessages ? 0 : 1 }}
            className="w-full shrink-0"
          />

          {/* Chat Messages */}
          <AnimatePresence>
            {hasMessages && (
              <motion.div 
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex-1 overflow-y-auto p-4 md:px-8 w-full absolute inset-0 top-[60px] bottom-[120px]" 
                ref={scrollRef}
              >
                <div className="max-w-[768px] mx-auto flex flex-col gap-6 pt-4 pb-8">
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      msg={msg}
                      onSourceClick={setActiveSource}
                      onSubmitFeedback={submitFeedback}
                      onChanged={() => { if (activeConversationId) void loadConversation(activeConversationId); }}
                      onSend={(content, body) => void handleSend(undefined, { content, body })}
                    />
                  ))}
                  
                  {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start items-center gap-4">
                       <div className="w-[32px] h-[32px] shrink-0 rounded-full bg-gradient-to-br from-[#c69aff]/50 to-[#8c55db]/50 flex items-center justify-center mt-1">
                          <Zap size={16} className="text-black dark:text-black/70 dark:text-white/70" />
                        </div>
                        <div className="text-[14px] flex gap-1">
                          <span className="animate-pulse text-black dark:text-black/50 dark:text-white/50">●</span>
                          <span className="animate-pulse text-black dark:text-black/50 dark:text-white/50" style={{animationDelay: '0.2s'}}>●</span>
                          <span className="animate-pulse text-black dark:text-black/50 dark:text-white/50" style={{animationDelay: '0.4s'}}>●</span>
                        </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* INPUT WRAPPER */}
          <motion.div 
            layout 
            className={`w-full max-w-[768px] mx-auto px-4 shrink-0 z-10 ${hasMessages ? 'absolute bottom-0 left-0 right-0 pb-6' : ''}`}
          >
             
             {/* Hero Title */}
             <AnimatePresence>
               {!hasMessages && (
                 <motion.div 
                   layout
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                   exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.95 }}
                   transition={{ duration: 0.3 }}
                   className="overflow-hidden flex flex-col items-center justify-center"
                 >
                   <h1 className="m-0 text-[32px] font-medium text-center text-black dark:text-white/90 drop-shadow-xl [text-shadow:0_0_20px_rgba(255,255,255,0.8)] dark:[text-shadow:0_2px_10px_rgba(0,0,0,0.8)]">
                     Bạn đã sẵn sàng chưa?
                   </h1>
                 </motion.div>
               )}
             </AnimatePresence>

             {/* ChatGPT Style Pill Input */}
             <motion.form 
               layout 
               onSubmit={handleSend} 
               className={`w-full relative flex items-end gap-2 bg-white/90 dark:bg-[#212121]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 overflow-hidden transition-all duration-300 rounded-[26px] shadow-lg ${hasMessages ? 'px-3 py-2' : 'px-4 py-3 max-w-[650px] mx-auto'}`}
             >
               <button type="button" className="p-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full border-0 cursor-pointer shrink-0 transition-colors flex items-center justify-center mb-1">
                  <Plus size={20} />
               </button>

               <textarea 
                 value={prompt} 
                 onChange={e => setPrompt(e.target.value)}
                 placeholder="Message EDU-04..."
                 rows={1}
                 className="flex-1 bg-transparent border-0 outline-none text-black dark:text-white/90 resize-none py-2 px-1 text-[16px] placeholder:text-black/40 dark:placeholder:text-white/40 max-h-[120px] min-h-[40px] leading-relaxed mb-0.5"
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleSend();
                   }
                 }}
               />
               
               <button type="submit" disabled={!prompt.trim() || isLoading || conversationLoading} className={`p-2.5 shrink-0 rounded-full border-0 cursor-pointer transition-colors flex items-center justify-center mb-1 ${prompt.trim() && !isLoading ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80' : 'bg-black/10 dark:bg-white/10 text-black/30 dark:text-white/30'}`}>
                  <ArrowUp size={20} strokeWidth={3} />
               </button>
             </motion.form>
             
             {/* Footer Text */}
             <motion.div layout className="text-center mt-3 text-[12px] text-black dark:text-black/40 dark:text-white/40">
               EDU-04 AI có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.
             </motion.div>
             {!hasMessages && (
               <QuickStart
                 onSend={(t) => void handleSend(undefined, { content: t, body: { content: t } })}
                 onFill={(t) => setPrompt(t)}
               />
             )}
          </motion.div>

          <motion.div 
            layout
            initial={false}
            animate={{ flexGrow: hasMessages ? 0 : 2 }}
            className="w-full shrink-0"
          />

        </div>
      </section>

      {/* 3. RIGHT SIDEBAR (Source Panel) */}
      <AnimatePresence>
        {activeSource && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 480, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="bg-white/95 dark:bg-[#0c1219]/95 backdrop-blur-xl border-l border-black/10 dark:border-white/10 flex flex-col shrink-0 z-20 overflow-hidden"
          >
            <div className="w-full flex flex-col h-full">
              <header className="h-[60px] shrink-0 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-4">
                <span className="font-semibold text-[14px]">Trích dẫn nguồn</span>
                <button onClick={() => setActiveSource(null)} className="p-1 text-black/60 dark:text-white/50 hover:text-black dark:hover:text-white bg-transparent border-0 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
                  <X size={18} />
                </button>
              </header>
              <div className="flex-1 p-4 overflow-y-auto">
                <SourceReader key={`${activeSource.citationId || activeSource.versionId}-${activeSource.page}`} source={activeSource} />
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
