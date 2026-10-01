"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Paperclip, ArrowUp, Zap, FileText, Menu, Plus, MessageSquare, X, ChevronRight, BookOpen, User, Compass, MoreHorizontal, Pencil, Pin, Folder, Share, Archive, Trash2, Sun, Moon, ShieldCheck, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import SourceReader from "../components/source-reader";
import { AppShell } from "@/components/layout/AppShell";
import { API, responseError } from "../lib/api-errors";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type { Message, Source } from "@/types/chat";
import { useTheme } from "next-themes";

const MOCK_HISTORY = [
  { id: 'h1', title: 'Tạo giao diện HTML CSS JavaScript' },
  { id: 'h2', title: 'Project Initialization Prompt' },
  { id: 'h3', title: 'Khả thi nhưng rủi ro cao' },
  { id: 'h4', title: 'Chọn máy lập trình' },
];

export default function UnifiedChat() {
  const { theme, setTheme } = useTheme();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [documentScope, setDocumentScope] = useState<{ id: string; title: string } | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<any[]>([]);
  const hasMessages = messages.length > 0;
  const [user, setUser] = useState<{ display_name?: string; role?: string } | null>(null);

  // Rename / Delete state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Feedback state
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const doc = params.get("document");
      if (doc) setDocumentScope({ id: doc, title: params.get("title") || "Tài liệu đã chọn" });
      try {
        const stored = localStorage.getItem('user');
        if (stored) setUser(JSON.parse(stored));
      } catch (e) {}
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ── Rename conversation ──────────────────────────────────────
  const startRename = (chatId: string, currentTitle: string) => {
    setRenamingId(chatId);
    setRenameValue(currentTitle || "");
    setTimeout(() => renameInputRef.current?.select(), 30);
  };

  const submitRename = async (chatId: string) => {
    const title = renameValue.trim();
    if (!title) { setRenamingId(null); return; }
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API}/conversations/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      if (res.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/login"; return; }
      if (!res.ok) { const err = await responseError(res); console.error(err); }
      setHistory(prev => prev.map(h => h.id === chatId ? { ...h, title } : h));
    } catch (err) { console.error("Rename failed", err); }
    setRenamingId(null);
  };

  // ── Delete conversation ─────────────────────────────────────
  const deleteConversation = async (chatId: string) => {
    if (!confirm("Bạn có chắc muốn xóa hội thoại này?")) return;
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API}/conversations/${chatId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/login"; return; }
      if (!res.ok && res.status !== 204) { const err = await responseError(res); console.error(err); return; }
      setHistory(prev => prev.filter(h => h.id !== chatId));
      if (activeConversationId === chatId) {
        setActiveConversationId(null);
        setMessages([]);
        setActiveSource(null);
        setDocumentScope(null);
        window.history.replaceState(null, "", "/");
      }
    } catch (err) { console.error("Delete failed", err); }
  };

  // ── Send feedback ──────────────────────────────────────────
  const submitFeedback = async (msgId: string, type: string) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      setFeedbackSent(prev => ({ ...prev, [msgId]: type }));
      await fetch(`${API}/answers/${msgId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, share_content: false })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") : "";
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/conversations`, {
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
        setHistory(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
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
        const loadedMessages: Message[] = data.items.map((m: any) => ({
          id: m.message_id || m.id,
          role: m.role,
          content: m.content,
          agentName: m.role === 'assistant' ? 'Academic Assistant' : undefined,
          sources: m.citations?.map((c: any) => ({
            id: c.id,
            citationId: c.citation_id, documentId: c.document_id, versionId: c.version_id,
            title: c.document_title || `Tài liệu ${c.document_id}`,
            page: c.locator?.value ?? c.locator_value ?? 1,
            content: c.quote || "",
            url: `${API}/documents/${c.document_id}/versions/${c.version_id}/download`
          })) || []
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

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading || conversationLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: prompt };
    setMessages(prev => [...prev, userMessage]);
    const currentPrompt = prompt;
    setPrompt("");
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
          body: JSON.stringify({ assistant: "academic", document_id: documentScope?.id })
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
          fetchHistory();
        }
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/conversations/${convId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ content: currentPrompt, assistant: "academic" }),
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
        id: data.id || (Date.now() + 1).toString(),
        role: "assistant",
        agentName: "Academic Assistant",
        content: data.content,
        sources: data.citations?.map((c: any) => ({
          id: c.id,
          citationId: c.citation_id, documentId: c.document_id, versionId: c.version_id,
          title: c.document_title || `Tài liệu ${c.document_id}`,
          page: c.locator?.value ?? c.locator_value ?? 1,
          content: c.quote || "",
          url: `${API}/documents/${c.document_id}/versions/${c.version_id}/download`
        })) || []
      };
      setMessages(prev => [...prev, assistantMessage]);
      fetchHistory(); // Cập nhật lịch sử
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

  return (
    <AppShell
      rightPanel={
        activeSource ? (
          <div className="w-full flex flex-col h-full bg-card">
            <header className="h-[60px] shrink-0 border-b border-border flex items-center justify-between px-4">
              <span className="font-semibold text-[14px] text-foreground">Trích dẫn nguồn</span>
              <button onClick={() => setActiveSource(null)} className="p-1 text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer rounded-lg hover:bg-secondary">
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 p-4 overflow-y-auto">
              <SourceReader key={`${activeSource.citationId || activeSource.versionId}-${activeSource.page}`} source={activeSource} />
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
        {/* HEADER */}
        <header className="h-[54px] shrink-0 flex items-center px-4 w-full relative z-10 border-b border-border/40">
          <div className="flex-1 flex justify-center w-full">
            <nav className="flex items-center bg-secondary/50 p-1 rounded-xl border border-border/60 shadow-xs" aria-label="Chuyển chế độ">
              <button 
                type="button"
                className="px-3.5 py-1.5 text-[13px] font-semibold bg-background text-foreground shadow-xs rounded-lg cursor-default border-0"
              >
                Hội thoại AI
              </button>
              <Link 
                href="/library" 
                className="px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors no-underline"
              >
                Thư viện tài liệu
              </Link>
            </nav>
          </div>
        </header>

        {documentScope && (
          <div className="mx-4 my-2 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-medium text-primary shadow-xs">
            <span className="truncate">Đang hội thoại trong phạm vi: <strong>{documentScope.title}</strong></span>
            <button 
              disabled={isLoading || conversationLoading} 
              className="shrink-0 underline hover:opacity-80 cursor-pointer font-semibold" 
              onClick={() => { setDocumentScope(null); setMessages([]); setActiveConversationId(null); setActiveSource(null); window.history.replaceState(null, "", "/"); }}
            >
              Hỏi tất cả tài liệu
            </button>
          </div>
        )}
        {conversationLoading && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">Đang tải hội thoại…</p>}
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
                   <h1 className="m-0 text-[32px] font-medium text-center text-foreground drop-shadow-sm">
                     Bạn đã sẵn sàng chưa?
                   </h1>
                 </motion.div>
               )}
             </AnimatePresence>

             {/* ChatGPT Style Pill Input */}
             <motion.form 
               layout 
               onSubmit={handleSend} 
               className={`w-full relative flex items-end gap-2 bg-card/90 backdrop-blur-xl border border-border overflow-hidden transition-all duration-300 rounded-[26px] shadow-lg ${hasMessages ? 'px-3 py-2' : 'px-4 py-3 max-w-[650px] mx-auto'}`}
             >
               <button type="button" className="p-2 text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-full border-0 cursor-pointer shrink-0 transition-colors flex items-center justify-center mb-1">
                  <Plus size={20} />
               </button>

               <textarea 
                 value={prompt} 
                 onChange={e => setPrompt(e.target.value)}
                 placeholder="Message EDU-04..."
                 rows={1}
                 className="flex-1 bg-transparent border-0 outline-none text-foreground resize-none py-2 px-1 text-[16px] placeholder:text-muted-foreground max-h-[120px] min-h-[40px] leading-relaxed mb-0.5"
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
          </motion.div>

          <motion.div 
            layout
            initial={false}
            animate={{ flexGrow: hasMessages ? 0 : 2 }}
            className="w-full shrink-0"
          />

        </div>
      </div>
    </AppShell>
  );
}
