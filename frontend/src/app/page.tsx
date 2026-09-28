"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Paperclip, ArrowUp, Zap, FileText, Menu, Plus, MessageSquare, X, ChevronRight, BookOpen, User, Compass, MoreHorizontal, Pencil, Pin, Folder, Share, Archive, Trash2, Sun, Moon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import * as HoverCard from '@radix-ui/react-hover-card';
import { useTheme } from "next-themes";

// MOCK DATA TYPES
type Role = 'user' | 'assistant';
type Source = { id: string; title: string; page: number; content: string; url?: string };
type Message = {
  id: string;
  role: Role;
  content: string;
  agentName?: string;
  sources?: Source[];
};

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<any[]>([]);
  const hasMessages = messages.length > 0;
  const [user, setUser] = useState<{ display_name?: string; role?: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
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
            title: c.document_title || `Tài liệu ${c.document_id}`,
            page: c.locator?.value ?? c.locator_value ?? 1,
            content: c.quote || "",
            url: c.url || `http://localhost:8000/api/v1/documents/${c.document_id}/versions/${c.version_id}/download`
          })) || []
        }));
        setMessages(loadedMessages);
        setActiveConversationId(convId);
        setActiveSource(null);
      }
    } catch (err) {
      console.error("Failed to load conversation", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading) return;

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
          body: JSON.stringify({ assistant: "academic" })
        });
        if (convRes.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
          return;
        }
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
        throw new Error("Chat request failed");
      }
      
      const data = await response.json();
      
      const assistantMessage: Message = {
        id: data.id || (Date.now() + 1).toString(),
        role: "assistant",
        agentName: "Academic Assistant",
        content: data.content,
        sources: data.citations?.map((c: any) => ({
          id: c.id,
          title: c.document_title || `Tài liệu ${c.document_id}`,
          page: c.locator?.value ?? c.locator_value ?? 1,
          content: c.quote || "",
          url: c.url || `http://localhost:8000/api/v1/documents/${c.document_id}/versions/${c.version_id}/download`
        })) || []
      };
      setMessages(prev => [...prev, assistantMessage]);
      fetchHistory(); // Cập nhật lịch sử
    } catch (err) {
      console.error(err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Xin lỗi, đã có lỗi xảy ra khi kết nối tới máy chủ."
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-[#081018] text-black dark:text-[#f7f7f8] font-sans overflow-hidden isolate relative">
      
      {/* BACKGROUND VIDEO */}
      <motion.div 
        animate={{ opacity: hasMessages ? 0.1 : 0.8, filter: hasMessages ? 'blur(20px)' : 'blur(0px)' }}
        transition={{ duration: 1 }}
        className="fixed inset-[-34px] z-[-3] overflow-hidden pointer-events-none"
      >
        <video autoPlay muted loop playsInline className="w-full h-full object-cover object-center saturate-[.72] brightness-[.8] dark:brightness-[.64] scale-[1.055] ambient-zoom">
          <source src="/assets/fastshot-bg.mp4" type="video/mp4" />
        </video>
      </motion.div>
      <div className="hidden dark:block fixed inset-0 z-[-2] pointer-events-none" style={{ background: 'radial-gradient(circle at 72% 47%, rgba(255,180,112,.14), transparent 28%), linear-gradient(180deg, rgba(5,10,16,.34), rgba(3,7,12,.43) 55%, rgba(3,7,12,.63))' }} />
      <div className="block dark:hidden fixed inset-0 z-[-2] pointer-events-none bg-white/20" />

      {/* LEFT SIDEBAR (ChatGPT Style) */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="h-full bg-white/95 dark:bg-[#0c1219]/95 backdrop-blur-2xl border-r border-black/5 dark:border-white/5 flex flex-col shrink-0 z-20 overflow-visible"
          >
            {/* Top Sidebar Actions */}
            <div className="p-3 w-[260px] flex justify-between items-center shrink-0">
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-black dark:text-black/50 dark:text-white/50 hover:text-black dark:text-white bg-transparent border-0 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5 dark:bg-black/5 dark:bg-white/5 transition-colors">
                <Menu size={20} />
              </button>
              <Link href={user ? "/profile" : "/login"} aria-label={user ? "Hồ sơ cá nhân" : "Đăng nhập"} title={user ? "Hồ sơ cá nhân" : "Đăng nhập"} className="p-2 text-black dark:text-black/50 dark:text-white/50 hover:text-black dark:text-white bg-transparent border-0 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5 dark:bg-black/5 dark:bg-white/5 transition-colors">
                <User size={20} />
              </Link>
            </div>

            {/* New Chat Button */}
            <div className="px-3 pb-3 w-[260px] shrink-0">
              <button onClick={() => { setMessages([]); setActiveSource(null); setActiveConversationId(null); }} className="w-full flex items-center justify-between bg-white/5 dark:bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 dark:bg-black/10 dark:bg-white/10 border border-black/5 dark:border-white/5 text-black dark:text-black/90 dark:text-white/90 px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-[14px] font-medium">
                <span className="flex items-center gap-2">
                  <div className="w-[20px] h-[20px] rounded-full bg-gradient-to-br from-[#c69aff] to-[#8c55db] flex items-center justify-center shadow-md">
                    <Zap size={12} className="text-black dark:text-white" />
                  </div>
                  Chat mới
                </span>
                <Plus size={16} className="text-black dark:text-black/50 dark:text-white/50" />
              </button>
            </div>

            {/* Main Links */}
            <div className="px-3 py-1 flex flex-col gap-1 w-[260px] shrink-0">
              <Link href="/hub" className="flex items-center gap-3 text-black dark:text-black/70 dark:text-white/70 hover:text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-3 py-2 rounded-lg text-[14px] transition-colors no-underline">
                <BookOpen size={18} /> Thư viện tài liệu
              </Link>
              <Link href="/courses" className="flex items-center gap-3 text-black dark:text-black/70 dark:text-white/70 hover:text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-3 py-2 rounded-lg text-[14px] transition-colors no-underline">
                <Compass size={18} /> Khóa học của tôi
              </Link>
            </div>

            {/* History */}
            <div className="flex-1 overflow-y-auto overflow-x-visible px-3 py-4 w-[260px] relative">
              <div className="text-xs font-semibold text-black dark:text-black/40 dark:text-white/40 mb-3 px-2">Gần đây (Recents)</div>
              
              {history.map((chat) => (
                <div key={chat.id} onClick={() => loadConversation(chat.id)} className={`group relative w-full flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-3 py-2.5 rounded-lg cursor-pointer mb-1 ${activeConversationId === chat.id ? 'bg-black/5 dark:bg-white/10' : ''}`}>
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                     <span className="truncate text-[14px] text-black dark:text-black/80 dark:text-white/80">{chat.title || "Hội thoại mới"}</span>
                  </div>
                  
                  {/* Radix Hover Card */}
                  <HoverCard.Root openDelay={0} closeDelay={150}>
                    <HoverCard.Trigger asChild>
                      <div className="flex items-center shrink-0 ml-2 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
                         <button 
                           onClick={(e) => e.stopPropagation()} 
                           className="p-1 text-black dark:text-black/50 dark:text-white/50 hover:text-black dark:text-white bg-transparent border-0 cursor-pointer rounded"
                         >
                            <MoreHorizontal size={16} />
                         </button>
                      </div>
                    </HoverCard.Trigger>
                    
                    <HoverCard.Portal>
                      <HoverCard.Content 
                        side="right" 
                        align="start" 
                        sideOffset={8}
                        className="w-[180px] bg-white dark:bg-[#1a1b1e] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 py-1.5 backdrop-blur-xl animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
                      >
                        <button className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-medium text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white focus:bg-black/5 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-left cursor-pointer border-0 bg-transparent outline-none">
                          <Pencil size={15} /> Rename
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-medium text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white focus:bg-black/5 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-left cursor-pointer border-0 bg-transparent outline-none">
                          <Pin size={15} /> Pin
                        </button>
                        <button className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white focus:bg-black/5 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-left cursor-pointer border-0 bg-transparent outline-none">
                          <div className="flex items-center gap-3"><Folder size={15} /> Move to project</div>
                          <ChevronRight size={14} className="opacity-50" />
                        </button>
                        
                        <div className="h-[1px] bg-black/10 dark:bg-white/10 my-1.5 mx-2" />
                        
                        <button className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-medium text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white focus:bg-black/5 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-left cursor-pointer border-0 bg-transparent outline-none">
                          <Share size={15} /> Share
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-medium text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white focus:bg-black/5 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-left cursor-pointer border-0 bg-transparent outline-none">
                          <Archive size={15} /> Archive
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-medium text-[#ff6b6b] hover:bg-[#ff6b6b]/10 hover:text-[#ff8787] focus:bg-[#ff6b6b]/10 focus:text-[#ff8787] text-left cursor-pointer border-0 bg-transparent outline-none">
                          <Trash2 size={15} /> Delete
                        </button>
                      </HoverCard.Content>
                    </HoverCard.Portal>
                  </HoverCard.Root>
                </div>
              ))}
            </div>

            {/* Theme Toggle & User */}
            <div className="p-3 border-t border-black/10 dark:border-white/10 mt-auto flex items-center justify-between shrink-0">
              <a href="/profile" aria-label="Mở hồ sơ cá nhân" className="flex items-center gap-3 rounded-lg hover:opacity-80">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shrink-0" />
                 <div className="flex flex-col">
                    <span className="text-sm font-medium text-black dark:text-white">
                      {user ? (user.display_name || 'Khách') : 'Khách'}
                    </span>
                    <span className="text-[11px] text-black/50 dark:text-white/50 capitalize">
                      {user ? (user.role || 'Guest') : 'Guest'}
                    </span>
                 </div>
              </a>
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-lg border-0 cursor-pointer bg-transparent transition-colors"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col relative min-w-0 h-screen overflow-hidden">
        
        {/* HEADER */}
        <header className="h-[60px] shrink-0 flex items-center px-4 w-full relative z-10">
          <AnimatePresence>
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white bg-transparent border-0 cursor-pointer mr-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 absolute left-4 z-10 transition-colors"
              >
                <Menu size={20} />
              </motion.button>
            )}
          </AnimatePresence>
          
          {/* Center Model Toggle (Chat / Work) */}
          <div className="flex-1 flex justify-center w-full">
            <div className="flex bg-white/80 dark:bg-[#151619]/80 backdrop-blur-md rounded-xl p-1 border border-black/5 dark:border-white/5 shadow-sm">
              <button className="px-4 py-1.5 text-[14px] font-medium bg-black/10 dark:bg-white/10 text-black dark:text-white rounded-lg cursor-pointer border-0 shadow-sm">Chat</button>
              <button className="px-4 py-1.5 text-[14px] font-medium text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white bg-transparent rounded-lg cursor-pointer border-0 transition-colors">Tài liệu</button>
            </div>
          </div>
        </header>

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
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-[32px] h-[32px] shrink-0 rounded-full bg-gradient-to-br from-[#c69aff] to-[#8c55db] flex items-center justify-center mt-1">
                          <Zap size={16} className="text-black dark:text-white" />
                        </div>
                      )}
                      
                      <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-black/5 dark:bg-[#2f2f2f] text-black dark:text-white rounded-[20px] px-5 py-3' : 'bg-blue-50/80 dark:bg-[#1a2b4c]/80 text-blue-900 dark:text-blue-100 rounded-[20px] px-5 py-4'}`}>
                        {msg.agentName && (
                          <div className="text-[12px] font-semibold text-[#c69aff] mb-2 uppercase tracking-wide">
                            {msg.agentName}
                          </div>
                        )}
                        
                        {msg.role === 'user' ? (
                          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                        ) : (
                          <div className="prose prose dark:prose-invert max-w-none text-[15px] leading-relaxed prose-p:mb-4 prose-a:text-blue-600 dark:prose-a:text-[#60a5fa] prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({node, ...props}) => {
                                  return (
                                    <a 
                                      {...props} 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        const matchedSource = msg.sources?.find(s => s.url === props.href);
                                        if (matchedSource) {
                                          setActiveSource(matchedSource);
                                        } else if (props.href) {
                                          window.open(props.href, '_blank');
                                        }
                                      }}
                                      className="cursor-pointer"
                                    />
                                  );
                                }
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {msg.role === 'assistant' && !!msg.sources?.length && (
                          <section aria-label="Nguồn tham khảo" className="mt-4 border-t border-blue-200 dark:border-blue-800 pt-3">
                            <h3 className="text-sm font-semibold mb-2">Nguồn tham khảo</h3>
                            <ul className="space-y-2">
                              {msg.sources.map((source) => (
                                <li key={source.id}>
                                  <button type="button" onClick={() => setActiveSource(source)} className="w-full text-left rounded-lg p-3 bg-white/60 dark:bg-black/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer">
                                    <span className="block text-sm font-medium">[{source.id}] {source.title} — Trang {source.page}</span>
                                    {source.content && <span className="block text-xs mt-1 opacity-80 whitespace-pre-wrap">“{source.content}”</span>}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}
                      </div>
                    </motion.div>
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
               
               <button type="submit" disabled={!prompt.trim() || isLoading} className={`p-2.5 shrink-0 rounded-full border-0 cursor-pointer transition-colors flex items-center justify-center mb-1 ${prompt.trim() && !isLoading ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80' : 'bg-black/10 dark:bg-white/10 text-black/30 dark:text-white/30'}`}>
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
      </main>

      {/* 3. RIGHT SIDEBAR (Source Panel) */}
      <AnimatePresence>
        {activeSource && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="bg-white/95 dark:bg-[#0c1219]/95 backdrop-blur-xl border-l border-black/10 dark:border-white/10 flex flex-col shrink-0 z-20 overflow-hidden"
          >
            <div className="w-[320px] flex flex-col h-full">
              <header className="h-[60px] shrink-0 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-4">
                <span className="font-semibold text-[14px]">Trích dẫn nguồn</span>
                <button onClick={() => setActiveSource(null)} className="p-1 text-black/60 dark:text-white/50 hover:text-black dark:hover:text-white bg-transparent border-0 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
                  <X size={18} />
                </button>
              </header>
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-[#60a5fa] mb-2">
                    <FileText size={16} />
                    <span className="text-[13px] font-medium break-all">{activeSource.title}</span>
                  </div>
                  <div className="text-[12px] text-black/50 dark:text-white/50 mb-4">Trang {activeSource.page}</div>
                  
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/40 dark:bg-[#60a5fa]/30 rounded-full"></div>
                    <p className="text-[14px] text-black/80 dark:text-white/80 leading-relaxed pl-4 m-0 italic">
                      "{activeSource.content}"
                    </p>
                  </div>

                  <a href={activeSource.url || "#"} target="_blank" rel="noreferrer" className="w-full mt-6 flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black/90 dark:text-white/90 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer no-underline">
                    Mở tài liệu gốc <ChevronRight size={14} />
                  </a>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes ambientZoom { 
          from { transform: scale(1.055) translate3d(-.4%, 0, 0); } 
          to { transform: scale(1.095) translate3d(.5%, -.35%, 0); } 
        } 
        .ambient-zoom { 
          animation: ambientZoom 14s ease-in-out infinite alternate; 
          will-change: transform; 
        }
      `}</style>
    </div>
  );
}
