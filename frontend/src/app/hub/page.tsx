"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Search, FileText, ChevronRight, ChevronLeft, Layers, Plus, X,
  RotateCw, Download, Share2, Bookmark, MessageSquare, Star,
  CheckCircle2, Clock, AlertCircle, Pencil, Trash2,
  ArrowLeft, Menu, BookOpen, AlignLeft, Tag, Calendar, User2, Hash,
  MousePointer2, Type, Minus,
} from "lucide-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "active" | "pending" | "rejected" | "processing";
type TabId = "design" | "info";
type PanelSection = "pages" | "outline" | "search";
type ActiveTool = "select" | "text" | "hand";

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
  letterSpacing: number;
}

interface TextBlock {
  id: string;
  text: string;
  style: TextStyle;
  tag: "h1" | "h2" | "h3" | "p" | "blockquote";
}

interface DocMeta {
  id: string; title: string; subject: string; author: string;
  pages: number; size: string; uploadedAt: string; status: DocStatus;
  tags: string[]; starred: boolean; description: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_DOCS: DocMeta[] = [
  { id:"d1", title:"Slide_Chuong_1_AI.pdf",  subject:"Tri tue nhan tao",   author:"GS. Nguyen Van A", pages:48,  size:"4.2 MB",  uploadedAt:"2026-09-20", status:"active",     tags:["AI","ML","Chuong 1"],       starred:true,  description:"Bai giang chuong 1 gioi thieu tong quan ve Tri tue nhan tao va Machine Learning." },
  { id:"d2", title:"GiaoTrinh_KienTrucMayTinh.pdf", subject:"Kien truc may tinh", author:"TS. Tran Thi B",  pages:312, size:"18.7 MB", uploadedAt:"2026-09-18", status:"active",  tags:["CPU","Memory","I/O"],         starred:false, description:"Giao trinh day du ve kien truc may tinh tu co ban den nang cao." },
  { id:"d3", title:"Bai_tap_CTDL_va_GT.pdf", subject:"CTDL va Giai thuat", author:"ThS. Le Van C",  pages:64,  size:"2.1 MB",  uploadedAt:"2026-09-22", status:"pending",    tags:["Bai tap","Sorting","Graph"], starred:false, description:"Tap bai tap thuc hanh ve cau truc du lieu va giai thuat." },
  { id:"d4", title:"Slide_Mang_May_Tinh_C3.pdf", subject:"Mang may tinh", author:"GS. Pham Van D",  pages:72,  size:"5.8 MB",  uploadedAt:"2026-09-15", status:"processing", tags:["TCP/IP","Routing","Chuong 3"], starred:true,  description:"Slide chuong 3 ve giao thuc mang va dinh tuyen." },
  { id:"d5", title:"Trac_nghiem_CSDL.pdf",   subject:"Co so du lieu",      author:"TS. Hoang Thi E", pages:28,  size:"1.4 MB",  uploadedAt:"2026-09-23", status:"rejected",   tags:["SQL","NoSQL","De thi"],      starred:false, description:"Bo cau hoi trac nghiem on tap mon co so du lieu." },
];

const OUTLINE = [
  { id:"o1", level:0, title:"1. Gioi thieu", page:3 },
  { id:"o2", level:1, title:"1.1 Lich su phat trien", page:4 },
  { id:"o3", level:1, title:"1.2 Dinh nghia AI", page:7 },
  { id:"o4", level:0, title:"2. Machine Learning", page:12 },
  { id:"o5", level:1, title:"2.1 Hoc co giam sat", page:13 },
  { id:"o6", level:1, title:"2.2 Hoc khong giam sat", page:18 },
  { id:"o7", level:0, title:"3. Deep Learning", page:28 },
  { id:"o8", level:1, title:"3.1 Mang no-ron", page:29 },
  { id:"o9", level:1, title:"3.2 CNN", page:35 },
];

const PAGE_THUMBS = Array.from({ length: 8 }, (_, i) => ({ page: i + 1 }));

const FONTS = ["Inter", "Georgia", "Times New Roman", "Courier New", "Arial", "Manrope", "Playfair Display"];
const WEIGHTS: { label: string; value: string }[] = [
  { label: "Light",    value: "300" },
  { label: "Regular",  value: "400" },
  { label: "Medium",   value: "500" },
  { label: "Semibold", value: "600" },
  { label: "Bold",     value: "700" },
];

// Default styles per tag type
const TAG_DEFAULTS: Record<TextBlock["tag"], Partial<TextStyle>> = {
  h1:         { fontSize: 42, fontWeight: "400", lineHeight: 1.1, letterSpacing: -0.96 },
  h2:         { fontSize: 28, fontWeight: "500", lineHeight: 1.2, letterSpacing: -0.3  },
  h3:         { fontSize: 20, fontWeight: "600", lineHeight: 1.3, letterSpacing: -0.1  },
  p:          { fontSize: 14, fontWeight: "400", lineHeight: 1.75, letterSpacing: 0    },
  blockquote: { fontSize: 15, fontWeight: "400", lineHeight: 1.65, letterSpacing: 0    },
};

function makeBlock(tag: TextBlock["tag"], text: string, overrides: Partial<TextStyle> = {}): TextBlock {
  return {
    id: `b-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    tag,
    style: {
      fontFamily: "Inter",
      fontSize: 14,
      fontWeight: "400",
      lineHeight: 1.75,
      color: "inherit",
      textAlign: "left",
      letterSpacing: 0,
      ...TAG_DEFAULTS[tag],
      ...overrides,
    },
  };
}

// Initial page 1 blocks
const INITIAL_BLOCKS_P1: TextBlock[] = [
  makeBlock("h1",         "Slide_Chuong_1_AI"),
  makeBlock("p",          "Bai giang chuong 1 gioi thieu tong quan ve Tri tue nhan tao va Machine Learning. Noi dung bao gom lich su phat trien, cac dinh nghia co ban va ung dung thuc te.", { color: "#888" }),
  makeBlock("h2",         "1. Gioi thieu"),
  makeBlock("p",          "Tri tue nhan tao (AI) la linh vuc khoa hoc nghien cuu cach tao ra may moc co kha nang thuc hien cac nhiem vu doi hoi tri tue cua con nguoi."),
  makeBlock("h3",         "1.1 Lich su phat trien"),
  makeBlock("p",          "Thuat ngu AI duoc dat ra boi John McCarthy vao nam 1956 tai hoi nghi Dartmouth. Ke tu do, linh vuc nay da trai qua nhieu giai doan phat trien va suy thoai (AI winters)."),
  makeBlock("blockquote", '"Artificial Intelligence is the science of making machines do things that would require intelligence if done by men." — Marvin Minsky'),
  makeBlock("h2",         "2. Machine Learning"),
  makeBlock("p",          "Machine Learning la mot nhanh cua AI cho phep may tinh hoc tu du lieu ma khong can lap trinh tuong minh. Co ba loai chinh: hoc co giam sat, hoc khong giam sat va hoc tang cuong."),
];

// ─── StatusBadge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DocStatus }) {
  const cfg: Record<DocStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    active:     { label:"Da duyet",  cls:"text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon:<CheckCircle2 size={11}/> },
    pending:    { label:"Cho duyet", cls:"text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",         icon:<Clock size={11}/> },
    processing: { label:"Xu ly",     cls:"text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",             icon:<RotateCw size={11} className="animate-spin"/> },
    rejected:   { label:"Tu choi",   cls:"text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20",                 icon:<AlertCircle size={11}/> },
  };
  const { label, cls, icon } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ─── Inspector Input ──────────────────────────────────────────────────────────
function InspectorInput({ label, value, onChange, type = "text", min, max, step, suffix }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-[9px] text-black/40 dark:text-white/40 block mb-1 uppercase tracking-wider">{label}</span>
      <div className="relative">
        <input
          type={type} value={value} min={min} max={max} step={step}
          onChange={e => onChange(e.target.value)}
          className="w-full h-[26px] border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 rounded-md px-2 text-[11px] text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500/50 pr-6"
        />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-black/35 dark:text-white/35 pointer-events-none">{suffix}</span>}
      </div>
    </label>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KnowledgeHub() {
  const { theme, setTheme } = useTheme();

  // ── Left sidebar state
  const [query, setQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<DocMeta | null>(MOCK_DOCS[0]);
  const [leftPanel, setLeftPanel] = useState<PanelSection>("pages");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchHl, setSearchHl] = useState("");
  const [starredSet, setStarredSet] = useState<Set<string>>(new Set(["d1","d4"]));

  // ── Viewport state
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");

  // ── Right panel state
  const [rightTab, setRightTab] = useState<TabId>("design");
  const [isRightOpen, setIsRightOpen] = useState(true);

  // ── Text editing state (THE MAIN FEATURE)
  const [blocks, setBlocks] = useState<TextBlock[]>(INITIAL_BLOCKS_P1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  // ─── Style read from selected block ───────────────────────────────────────
  const getComputedTypo = useCallback((): TextStyle | null => {
    if (!selectedBlock) return null;
    return selectedBlock.style;
  }, [selectedBlock]);

  const typo = getComputedTypo();

  // ─── Update style of selected block ───────────────────────────────────────
  const updateStyle = useCallback(<K extends keyof TextStyle>(key: K, value: TextStyle[K]) => {
    if (!selectedId) return;
    setBlocks(prev => prev.map(b =>
      b.id === selectedId ? { ...b, style: { ...b.style, [key]: value } } : b
    ));
  }, [selectedId]);

  // ─── Update text content of selected block ────────────────────────────────
  const updateText = useCallback((id: string, text: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text } : b));
  }, []);

  // ─── Add new text block ───────────────────────────────────────────────────
  const addBlock = useCallback((tag: TextBlock["tag"] = "p") => {
    const newBlock = makeBlock(tag, tag === "h1" ? "Tieu de moi" : tag === "h2" ? "Phu tieu de" : tag === "h3" ? "Tieu de nho" : "Nhan vao day de chinh sua noi dung...");
    const idx = selectedId ? blocks.findIndex(b => b.id === selectedId) : blocks.length - 1;
    setBlocks(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, newBlock);
      return next;
    });
    setSelectedId(newBlock.id);
    setActiveTool("select");
    // Focus after render
    setTimeout(() => {
      blockRefs.current[newBlock.id]?.focus();
    }, 50);
  }, [selectedId, blocks]);

  // ─── Delete selected block ────────────────────────────────────────────────
  const deleteBlock = useCallback(() => {
    if (!selectedId || blocks.length <= 1) return;
    const idx = blocks.findIndex(b => b.id === selectedId);
    setBlocks(prev => prev.filter(b => b.id !== selectedId));
    setSelectedId(blocks[Math.max(0, idx - 1)]?.id ?? null);
  }, [selectedId, blocks]);

  // ─── Click-to-select block ────────────────────────────────────────────────
  const handleBlockClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    if (activeTool === "text") {
      blockRefs.current[id]?.focus();
    }
  }, [activeTool]);

  // ─── Canvas click deselects ───────────────────────────────────────────────
  const handleCanvasClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
      if (e.key === "Delete" && selectedId && document.activeElement?.tagName !== "INPUT" && !(document.activeElement as HTMLElement)?.isContentEditable) {
        deleteBlock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteBlock]);

  // ─── Doc select ───────────────────────────────────────────────────────────
  const handleSelectDoc = (doc: DocMeta) => {
    setSelectedDoc(doc);
    setCurrentPage(1);
    setZoom(1);
    setSelectedId(null);
    setBlocks(INITIAL_BLOCKS_P1);
  };

  const toggleStar = (id: string) => setStarredSet(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const handleZoom = (d: number) => setZoom(z => Math.max(0.4, Math.min(2.5, z + d)));

  const [docs, setDocs] = useState<DocMeta[]>(MOCK_DOCS);

  useEffect(() => {
    const loadHubDocs = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        
        const coursesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/me/courses`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!coursesRes.ok) return;
        const coursesData = await coursesRes.json();
        const courseIds = (coursesData.items || []).map((c: any) => c.id);
        
        if (courseIds.length > 0) {
          const courseId = courseIds[0];
          const docsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/documents?course_id=${courseId}`, {
             headers: { Authorization: `Bearer ${token}` }
          });
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            const mappedDocs: DocMeta[] = (docsData.items || []).map((item: any) => ({
              id: item.version_id,
              title: item.title || 'Unknown Document',
              subject: courseId,
              author: item.authors?.[0] || 'Unknown',
              pages: item.page_count || 0,
              size: '0 MB',
              uploadedAt: item.published_at ? new Date(item.published_at).toISOString().split('T')[0] : '',
              status: item.state === 'Published' ? 'active' : 'pending',
              tags: [],
              starred: false,
              description: item.version_label || ''
            }));
            setDocs(mappedDocs.length > 0 ? mappedDocs : MOCK_DOCS);
          }
        }
      } catch (err) {
        console.error("Failed to load hub docs", err);
      }
    };
    loadHubDocs();
  }, []);

  const filteredDocs = docs.filter(d => {
    const q = query.toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || d.subject.toLowerCase().includes(q);
  });

  // ─── Block renderer ───────────────────────────────────────────────────────
  const renderBlock = (block: TextBlock) => {
    const isSelected = selectedId === block.id;
    const style: React.CSSProperties = {
      fontFamily: block.style.fontFamily + ", Inter, sans-serif",
      fontSize: block.style.fontSize + "px",
      fontWeight: block.style.fontWeight,
      lineHeight: block.style.lineHeight,
      color: block.style.color === "inherit" ? undefined : block.style.color,
      textAlign: block.style.textAlign,
      letterSpacing: block.style.letterSpacing + "px",
      outline: "none",
      margin: 0,
    };

    const commonProps = {
      ref: (el: HTMLElement | null) => { blockRefs.current[block.id] = el; },
      contentEditable: true,
      suppressContentEditableWarning: true,
      onClick: (e: React.MouseEvent) => handleBlockClick(e, block.id),
      onFocus: () => setSelectedId(block.id),
      onInput: (e: React.FormEvent<HTMLElement>) => updateText(block.id, (e.target as HTMLElement).innerText),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey && block.tag !== "p" && block.tag !== "blockquote") {
          e.preventDefault();
          addBlock("p");
        }
      },
      style,
      className: [
        "relative cursor-text transition-all duration-100",
        isSelected
          ? "outline outline-2 outline-offset-2 outline-blue-500/60 rounded-sm"
          : "hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-black/15 dark:hover:outline-white/15 rounded-sm",
        block.tag === "blockquote" ? "border-l-4 border-black/15 dark:border-white/15 pl-5 italic text-black/65 dark:text-white/65" : "",
      ].join(" "),
    };

    switch (block.tag) {
      case "h1": return <h1 key={block.id} {...commonProps}>{block.text}</h1>;
      case "h2": return <h2 key={block.id} {...commonProps}>{block.text}</h2>;
      case "h3": return <h3 key={block.id} {...commonProps}>{block.text}</h3>;
      case "blockquote": return <blockquote key={block.id} {...commonProps}>{block.text}</blockquote>;
      default:   return <p   key={block.id} {...commonProps}>{block.text}</p>;
    }
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#efefe4] dark:bg-[#0b0e14] text-black dark:text-white font-sans overflow-hidden">

      {/* ─── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width:0, opacity:0 }} animate={{ width:240, opacity:1 }} exit={{ width:0, opacity:0 }}
            transition={{ type:"spring", bounce:0, duration:0.35 }}
            className="h-full bg-[#fafaf8] dark:bg-[#0f1318] border-r border-black/10 dark:border-white/8 flex flex-col shrink-0 overflow-hidden z-10"
          >
            <div className="w-[240px] flex flex-col h-full">
              <div className="h-[38px] shrink-0 flex items-center justify-between px-3 border-b border-black/8 dark:border-white/6">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-[#7f8a8c] flex items-center justify-center"><BookOpen size={11} className="text-white"/></div>
                  <span className="text-[11px] font-semibold text-black/70 dark:text-white/70">Knowledge Hub</span>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="w-5 h-5 flex items-center justify-center rounded text-black/40 dark:text-white/40 hover:bg-black/6 dark:hover:bg-white/6 transition-colors"><X size={13}/></button>
              </div>

              <div className="px-2.5 py-2 shrink-0">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35"/>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tim tai lieu..." className="w-full h-[27px] pl-7 pr-3 rounded-md bg-black/6 dark:bg-white/6 border border-black/8 dark:border-white/8 text-[11px] text-black dark:text-white outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20"/>
                </div>
              </div>

              <div className="flex px-2.5 pb-1.5 shrink-0">
                {(["pages","outline","search"] as PanelSection[]).map(p => (
                  <button key={p} onClick={() => setLeftPanel(p)} className={`flex-1 h-[26px] text-[10px] rounded-md transition-all ${leftPanel===p?"bg-black/8 dark:bg-white/8 text-black dark:text-white font-medium":"text-black/45 dark:text-white/45"}`}>
                    {p==="pages"?"Tai lieu":p==="outline"?"Muc luc":"Tim kiem"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pb-2 px-2">
                {leftPanel === "pages" && filteredDocs.map(doc => (
                  <div key={doc.id} onClick={() => handleSelectDoc(doc)} className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-0.5 ${selectedDoc?.id===doc.id?"bg-black/8 dark:bg-white/8 ring-1 ring-black/15 dark:ring-white/15":"hover:bg-black/5 dark:hover:bg-white/5"}`}>
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 w-8 h-10 rounded flex-none flex items-center justify-center text-lg ${selectedDoc?.id===doc.id?"bg-orange-100 dark:bg-orange-900/30":"bg-black/5 dark:bg-white/5"}`}>📄</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium truncate">{doc.title}</p>
                        <p className="text-[10px] text-black/50 dark:text-white/50 mt-0.5 truncate">{doc.subject}</p>
                        <div className="flex items-center gap-2 mt-1.5"><StatusBadge status={doc.status}/><span className="text-[10px] text-black/35 dark:text-white/35">{doc.pages}tr</span></div>
                      </div>
                      {starredSet.has(doc.id) && <Star size={12} className="text-amber-400 flex-none mt-0.5" fill="currentColor"/>}
                    </div>
                  </div>
                ))}

                {leftPanel === "outline" && selectedDoc && (
                  <div className="pt-1">
                    {OUTLINE.map(item => (
                      <button key={item.id} onClick={() => setCurrentPage(item.page)} style={{ paddingLeft:`${8+item.level*14}px` }} className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <span className={`text-[11px] ${item.level===0?"font-medium":"text-black/60 dark:text-white/60"}`}>{item.title}</span>
                        <span className="text-[10px] text-black/35 dark:text-white/35">{item.page}</span>
                      </button>
                    ))}
                  </div>
                )}

                {leftPanel === "search" && (
                  <div className="pt-1">
                    <div className="relative mb-2">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35"/>
                      <input value={searchHl} onChange={e => setSearchHl(e.target.value)} placeholder="Tim trong tai lieu..." className="w-full h-[27px] pl-7 pr-3 rounded-md bg-black/6 dark:bg-white/6 border border-black/8 dark:border-white/8 text-[11px] text-black dark:text-white outline-none"/>
                    </div>
                    {searchHl ? [4,12,28].map(pg => (
                      <button key={pg} onClick={() => setCurrentPage(pg)} className="w-full text-left px-2 py-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <p className="text-[10px] text-black/40 dark:text-white/40 mb-0.5">Trang {pg}</p>
                        <p className="text-[11px] leading-snug">...lien quan den &ldquo;{searchHl}&rdquo;...</p>
                      </button>
                    )) : <p className="text-[11px] text-black/35 dark:text-white/35 text-center py-6">Nhap tu khoa de tim</p>}
                  </div>
                )}
              </div>

              <div className="h-[38px] shrink-0 border-t border-black/8 dark:border-white/6 flex items-center gap-1 px-2">
                <button className="h-[28px] px-2 rounded-md text-[10px] text-black/55 dark:text-white/55 hover:bg-black/6 dark:hover:bg-white/6 flex items-center gap-1.5 transition-colors"><Plus size={12}/> Tai len</button>
                <button className="h-[28px] px-2 rounded-md text-[10px] text-black/55 dark:text-white/55 hover:bg-black/6 dark:hover:bg-white/6 flex items-center gap-1.5 transition-colors"><Layers size={12}/> Tat ca</button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ─── MAIN WORKSPACE ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#e8e8e4] dark:bg-[#111418]">

        {/* Toolbar */}
        <div className="h-[40px] shrink-0 bg-white dark:bg-[#0f1318] border-b border-black/10 dark:border-white/8 flex items-center justify-between px-3 z-10 relative">

          {/* Left: nav + tool group */}
          <div className="flex items-center gap-1">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"><Menu size={15}/></button>
            )}
            <Link href="/" className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"><ArrowLeft size={15}/></Link>
            <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1"/>

            {/* Tool group — like paper template */}
            <div className="flex items-center gap-0.5 bg-black/4 dark:bg-white/4 rounded-lg p-0.5">
              {([
                { tool:"select", icon:<MousePointer2 size={13}/>, tip:"Select (V)" },
                { tool:"text",   icon:<Type size={13}/>,          tip:"Text (T)" },
                { tool:"hand",   icon:<span className="text-[13px] leading-none">✋</span>, tip:"Hand (H)" },
              ] as { tool: ActiveTool; icon: React.ReactNode; tip: string }[]).map(({ tool, icon, tip }) => (
                <button
                  key={tool} title={tip}
                  onClick={() => setActiveTool(tool)}
                  className={`h-[26px] w-[28px] flex items-center justify-center rounded-md transition-all ${activeTool===tool?"bg-white dark:bg-white/15 shadow-sm text-black dark:text-white":"text-black/45 dark:text-white/45 hover:text-black/70 dark:hover:text-white/70"}`}
                >
                  {icon}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1"/>
            <button title="Bookmark" className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/45 dark:text-white/45 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"><Bookmark size={14}/></button>
            <button title="Comment" className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/45 dark:text-white/45 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"><MessageSquare size={14}/></button>
          </div>

          {/* Center: zoom + pagination */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
            <button onClick={() => handleZoom(-0.1)} className="h-[26px] w-[26px] flex items-center justify-center rounded-md border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:bg-black/8 dark:hover:bg-white/8 transition-colors font-mono text-[15px]">-</button>
            <button onClick={() => setZoom(1)} className="h-[26px] min-w-[52px] text-[11px] font-medium text-black/70 dark:text-white/70 rounded-md border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 px-2 transition-colors">{Math.round(zoom*100)}%</button>
            <button onClick={() => handleZoom(0.1)} className="h-[26px] w-[26px] flex items-center justify-center rounded-md border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:bg-black/8 dark:hover:bg-white/8 transition-colors font-mono text-[15px]">+</button>
            <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1"/>
            <button onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage<=1} className="h-[26px] w-[26px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 disabled:opacity-30 transition-colors"><ChevronLeft size={14}/></button>
            <span className="text-[11px] text-black/60 dark:text-white/60 min-w-[72px] text-center">{currentPage} / {selectedDoc?.pages ?? "--"}</span>
            <button onClick={() => setCurrentPage(p => Math.min(selectedDoc?.pages??1,p+1))} disabled={currentPage>=(selectedDoc?.pages??1)} className="h-[26px] w-[26px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 disabled:opacity-30 transition-colors"><ChevronRight size={14}/></button>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            <button onClick={() => setTheme(theme==="dark"?"light":"dark")} className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 transition-colors text-sm">{theme==="dark"?"☀":"🌙"}</button>
            {selectedDoc && (
              <button onClick={() => toggleStar(selectedDoc.id)} className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 transition-colors">
                {starredSet.has(selectedDoc.id)?<Star size={14} className="text-amber-400" fill="currentColor"/>:<Star size={14}/>}
              </button>
            )}
            <button className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"><Download size={14}/></button>
            <button className="h-[28px] w-[28px] flex items-center justify-center rounded-md text-black/50 dark:text-white/50 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"><Share2 size={14}/></button>
            <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1"/>
            <button onClick={() => setIsRightOpen(r=>!r)} className={`h-[28px] px-2.5 rounded-md text-[10px] font-medium border transition-all ${isRightOpen?"bg-black/80 dark:bg-white/80 text-white dark:text-black border-transparent":"border-black/12 dark:border-white/12 text-black/60 dark:text-white/60 hover:border-black/25 dark:hover:border-white/25"}`}>
              Thuoc tinh
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div
          className={`flex-1 overflow-auto ${activeTool==="hand"?"cursor-grab active:cursor-grabbing":activeTool==="text"?"cursor-text":"cursor-default"}`}
          onClick={handleCanvasClick}
        >
          <div className="min-h-full flex items-start justify-center py-14 px-16">
            {selectedDoc ? (
              <motion.div
                key={selectedDoc.id}
                initial={{opacity:0,y:12,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{duration:0.25}}
                style={{ transform:`scale(${zoom})`, transformOrigin:"top center", marginBottom: zoom < 1 ? `${(1-zoom)*-1123*zoom}px` : undefined }}
                className="w-[794px] min-h-[1123px] bg-[#fcfcf9] dark:bg-[#1a1d22] border border-black/12 dark:border-white/10 rounded-sm shadow-[0_4px_16px_rgba(0,0,0,.14),0_2px_6px_-2px_rgba(0,0,0,.1)] relative"
                onClick={e => e.stopPropagation()}
              >
                {/* Doc header */}
                <div className="h-[60px] border-b border-black/8 dark:border-white/6 flex items-center justify-between px-10 bg-[#fafaf7] dark:bg-[#1e2128]">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                      <p className="text-[12px] font-semibold">{selectedDoc.title}</p>
                      <p className="text-[10px] text-black/45 dark:text-white/45">{selectedDoc.subject} · {selectedDoc.author}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedDoc.status}/>
                    <span className="text-[10px] text-black/35 dark:text-white/35">Trang {currentPage}/{selectedDoc.pages}</span>
                  </div>
                </div>

                {/* Editable content area */}
                <div className="px-16 py-12 space-y-4" onClick={e => e.stopPropagation()}>
                  {currentPage === 1 ? (
                    blocks.map(block => renderBlock(block))
                  ) : currentPage === 2 ? (
                    <div onClick={handleCanvasClick}>
                      <h2 style={{ fontFamily:"Inter,sans-serif", fontWeight:300, fontSize:22, margin:"0 0 32px", paddingBottom:12, borderBottom:"1px solid rgba(0,0,0,0.08)" }}>Muc luc</h2>
                      {OUTLINE.map(item => (
                        <div key={item.id} onClick={() => setCurrentPage(item.page)} style={{ paddingLeft:`${item.level*20}px` }} className="flex items-baseline justify-between py-2 border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/3 dark:hover:bg-white/3 transition-colors rounded px-2 -mx-2">
                          <span className={`${item.level===0?"text-[13px] font-medium":"text-[12px] text-black/60 dark:text-white/60"}`}>{item.title}</span>
                          <span className="text-[11px] text-black/35 dark:text-white/35 ml-4">{item.page}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div onClick={handleCanvasClick}>
                      {(() => { const s = [...OUTLINE].reverse().find(o => o.page<=currentPage); return s ? (
                        <>
                          <div className="flex items-center gap-2 text-[11px] text-black/35 dark:text-white/35 mb-8"><span>{selectedDoc.subject}</span><ChevronRight size={10}/><span>{s.title}</span></div>
                          <h2 style={{fontFamily:"Inter,sans-serif",fontWeight:400,fontSize:24,margin:"0 0 24px"}}>{s.title}</h2>
                        </>
                      ) : null; })()}
                      <div className="space-y-3">{Array.from({length:6}).map((_,i) => (<div key={i} className="space-y-1.5"><div className="h-[14px] rounded-full bg-black/8 dark:bg-white/8" style={{width:`${75+(i%3)*8}%`}}/><div className="h-[14px] rounded-full bg-black/5 dark:bg-white/5" style={{width:`${60+(i%4)*9}%`}}/></div>))}</div>
                      <div className="mt-8 p-5 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-600/20">
                        <p className="text-[12px] text-amber-800 dark:text-amber-300 font-medium mb-1">Luu y</p>
                        <p className="text-[12px] text-amber-700 dark:text-amber-400/80 leading-relaxed">Trang {currentPage} — Chinh sua text chi ho tro trang 1. Cac trang khac se hien thi PDF goc tu backend.</p>
                      </div>
                    </div>
                  )}

                  {/* Add block button — only page 1 */}
                  {currentPage === 1 && (
                    <div className="pt-4 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity group">
                      <div className="flex-1 h-px bg-black/10 dark:bg-white/10"/>
                      <div className="flex gap-1">
                        {([["p","Doan van"],["h2","Tieu de"],["h3","Tieu de nho"],["blockquote","Trich dan"]] as [TextBlock["tag"],string][]).map(([tag, label]) => (
                          <button key={tag} onClick={() => addBlock(tag)} className="px-2.5 h-[26px] rounded-md border border-black/12 dark:border-white/12 text-[10px] text-black/50 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors flex items-center gap-1">
                            <Plus size={10}/>{label}
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 h-px bg-black/10 dark:bg-white/10"/>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-5 left-0 right-0 flex justify-center">
                  <span className="text-[11px] text-black/30 dark:text-white/30">{currentPage}</span>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-black/30 dark:text-white/30">
                <FileText size={48} strokeWidth={1}/>
                <p className="text-[14px]">Chon tai lieu de xem va chinh sua</p>
              </div>
            )}
          </div>
        </div>

        {/* Thumbnail strip */}
        {selectedDoc && (
          <div className="h-[72px] shrink-0 border-t border-black/10 dark:border-white/8 bg-white dark:bg-[#0f1318] flex items-center gap-2 px-4 overflow-x-auto">
            {PAGE_THUMBS.map(({page}) => (
              <button key={page} onClick={() => { setCurrentPage(page); setSelectedId(null); }} className={`h-[54px] w-[38px] flex-none rounded border flex flex-col items-center justify-end pb-1 gap-0.5 transition-all ${currentPage===page?"border-black/50 dark:border-white/50 bg-black/8 dark:bg-white/8":"border-black/12 dark:border-white/10 text-black/35 dark:text-white/35 hover:border-black/25 dark:hover:border-white/25 bg-black/3 dark:bg-white/3"}`}>
                <div className="flex-1 w-full flex items-center justify-center"><div className="w-5 h-6 bg-black/6 dark:bg-white/6 rounded-sm"/></div>
                <span className="text-[9px]">{page}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* ─── RIGHT INSPECTOR ───────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isRightOpen && (
          <motion.aside
            initial={{ width:0, opacity:0 }} animate={{ width:260, opacity:1 }} exit={{ width:0, opacity:0 }}
            transition={{ type:"spring", bounce:0, duration:0.35 }}
            className="h-full bg-white dark:bg-[#0f1318] border-l border-black/10 dark:border-white/8 flex flex-col shrink-0 overflow-hidden z-10"
          >
            <div className="w-[260px] flex flex-col h-full overflow-y-auto">

              {/* Tabs */}
              <div className="h-[39px] shrink-0 border-b border-black/8 dark:border-white/6 flex items-end px-3 gap-4">
                {(["design","info"] as TabId[]).map(t => (
                  <button key={t} onClick={() => setRightTab(t)} className={`pb-[9px] text-[11px] border-b-2 transition-all ${rightTab===t?"text-black dark:text-white font-semibold border-black dark:border-white":"text-black/40 dark:text-white/40 border-transparent hover:text-black/70 dark:hover:text-white/70"}`}>
                    {t==="design"?"Thiet ke":"Thong tin"}
                  </button>
                ))}
              </div>

              {/* ── DESIGN TAB ── */}
              {rightTab === "design" && (
                <>
                  {/* Quick doc info */}
                  {selectedDoc && (
                    <div className="px-3 py-2.5 border-b border-black/6 dark:border-white/6">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-black/35 dark:text-white/35 uppercase tracking-wider">TAI LIEU</span>
                        <StatusBadge status={selectedDoc.status}/>
                      </div>
                      <p className="text-[11px] font-semibold truncate">{selectedDoc.title}</p>
                    </div>
                  )}

                  {/* ── TYPOGRAPHY — only when a block is selected ── */}
                  {typo ? (
                    <>
                      {/* Selection indicator */}
                      <div className="px-3 py-2 border-b border-black/6 dark:border-white/6 bg-blue-50/60 dark:bg-blue-950/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                            <Type size={11}/> {selectedBlock?.tag?.toUpperCase()} — Dang chinh sua
                          </span>
                          <button onClick={deleteBlock} title="Xoa block (Delete)" className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      </div>

                      {/* Font family */}
                      <section className="px-3 py-3 border-b border-black/6 dark:border-white/6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium">Typography</span>
                          <span className="text-[9px] text-black/35 dark:text-white/35">⌘T</span>
                        </div>
                        <label className="block mb-2">
                          <span className="text-[9px] text-black/40 dark:text-white/40 block mb-1 uppercase tracking-wider">Font</span>
                          <select
                            value={typo.fontFamily}
                            onChange={e => updateStyle("fontFamily", e.target.value)}
                            className="w-full h-[26px] border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 rounded-md px-2 text-[11px] text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500/50"
                          >
                            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </label>

                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          <div className="col-span-2">
                            <label className="block">
                              <span className="text-[9px] text-black/40 dark:text-white/40 block mb-1 uppercase tracking-wider">Weight</span>
                              <select
                                value={typo.fontWeight}
                                onChange={e => updateStyle("fontWeight", e.target.value)}
                                className="w-full h-[26px] border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 rounded-md px-2 text-[11px] text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500/50"
                              >
                                {WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                              </select>
                            </label>
                          </div>
                          <InspectorInput label="Size" type="number" value={typo.fontSize} min={8} max={120} step={1} suffix="px" onChange={v => updateStyle("fontSize", parseFloat(v)||14)}/>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                          <InspectorInput label="Line Height" type="number" value={typo.lineHeight} min={0.8} max={4} step={0.05} onChange={v => updateStyle("lineHeight", parseFloat(v)||1.5)}/>
                          <InspectorInput label="Spacing" type="number" value={typo.letterSpacing} min={-5} max={20} step={0.1} suffix="px" onChange={v => updateStyle("letterSpacing", parseFloat(v)||0)}/>
                        </div>

                        {/* Text align */}
                        <div className="mb-2">
                          <span className="text-[9px] text-black/40 dark:text-white/40 block mb-1 uppercase tracking-wider">Align</span>
                          <div className="flex gap-1">
                            {(["left","center","right"] as const).map(align => (
                              <button
                                key={align}
                                onClick={() => updateStyle("textAlign", align)}
                                className={`flex-1 h-[26px] rounded-md border text-[10px] transition-all ${typo.textAlign===align?"bg-black/80 dark:bg-white/80 text-white dark:text-black border-transparent":"border-black/10 dark:border-white/10 text-black/50 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5"}`}
                              >
                                {align==="left"?"◀":align==="center"?"═":"▶"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Color */}
                        <div>
                          <span className="text-[9px] text-black/40 dark:text-white/40 block mb-1 uppercase tracking-wider">Color</span>
                          <div className="flex items-center gap-2">
                            <div className="relative w-[26px] h-[26px] rounded-md border border-black/12 dark:border-white/12 overflow-hidden flex-none">
                              <div className="absolute inset-0" style={{ background: typo.color === "inherit" ? "#181818" : typo.color }}/>
                              <input
                                type="color"
                                value={typo.color === "inherit" ? "#181818" : typo.color}
                                onChange={e => updateStyle("color", e.target.value)}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              />
                            </div>
                            <input
                              type="text"
                              value={typo.color === "inherit" ? "#181818" : typo.color}
                              onChange={e => updateStyle("color", e.target.value)}
                              className="flex-1 h-[26px] border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 rounded-md px-2 text-[11px] font-mono text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500/50"
                            />
                            <button onClick={() => updateStyle("color", "inherit")} title="Reset color" className="h-[26px] w-[26px] flex items-center justify-center rounded-md border border-black/10 dark:border-white/10 text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                              <RotateCw size={11}/>
                            </button>
                          </div>
                        </div>
                      </section>

                      {/* Quick presets */}
                      <section className="px-3 py-3 border-b border-black/6 dark:border-white/6">
                        <span className="text-[11px] font-medium block mb-2">Chuyen thanh</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([["h1","Tieu de H1"],["h2","Phu de H2"],["h3","Tieu de nho H3"],["p","Doan van"],["blockquote","Trich dan"],] as [TextBlock["tag"],string][]).map(([tag, label]) => (
                            <button
                              key={tag}
                              onClick={() => {
                                if (!selectedId) return;
                                setBlocks(prev => prev.map(b => b.id===selectedId ? { ...b, tag, style:{ ...b.style, ...TAG_DEFAULTS[tag] } } : b));
                              }}
                              className={`h-[28px] rounded-md border text-[10px] transition-all ${selectedBlock?.tag===tag?"bg-black/80 dark:bg-white/80 text-white dark:text-black border-transparent":"border-black/10 dark:border-white/10 text-black/55 dark:text-white/55 hover:bg-black/5 dark:hover:bg-white/5"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </section>

                      {/* Add block */}
                      <section className="px-3 py-3 border-b border-black/6 dark:border-white/6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium">Them block moi</span>
                          <span className="text-[9px] text-black/35 dark:text-white/35">sau vi tri hien tai</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([["p","+ Doan van"],["h2","+ Tieu de"],["h3","+ Tieu de nho"],["blockquote","+ Trich dan"]] as [TextBlock["tag"],string][]).map(([tag, label]) => (
                            <button key={tag} onClick={() => addBlock(tag)} className="h-[28px] rounded-md border border-black/10 dark:border-white/10 text-[10px] text-black/55 dark:text-white/55 hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors">
                              {label}
                            </button>
                          ))}
                        </div>
                      </section>
                    </>
                  ) : (
                    /* No selection — show doc-level controls */
                    <>
                      <section className="px-3 py-3 border-b border-black/6 dark:border-white/6">
                        <p className="text-[11px] font-medium mb-2">Hien thi</p>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {([["Trang",currentPage.toString()],["Tong",selectedDoc?.pages.toString()??"--"],["Zoom",`${Math.round(zoom*100)}%`]] as [string,string][]).map(([l,v]) => (
                            <label key={l}><span className="text-[9px] text-black/40 dark:text-white/40 block mb-1">{l}</span><div className="h-[26px] border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 rounded-md px-2 flex items-center text-[10px] text-black/70 dark:text-white/70">{v}</div></label>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          {([["Fit",1],["75%",0.75],["125%",1.25],["150%",1.5]] as [string,number][]).map(([l,v]) => (
                            <button key={l} onClick={() => setZoom(v)} className={`flex-1 h-[28px] border rounded-md text-[10px] transition-colors ${zoom===v?"bg-black/80 dark:bg-white/80 text-white dark:text-black border-transparent":"border-black/10 dark:border-white/10 text-black/55 dark:text-white/55 hover:bg-black/5 dark:hover:bg-white/5"}`}>{l}</button>
                          ))}
                        </div>
                      </section>

                      {/* Hint */}
                      <div className="px-3 py-4 flex flex-col items-center text-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                          <MousePointer2 size={18} className="text-black/30 dark:text-white/30"/>
                        </div>
                        <p className="text-[11px] text-black/40 dark:text-white/40 leading-relaxed max-w-[160px]">Click vao mot doan text de chon va chinh sua typography</p>
                        <p className="text-[10px] text-black/30 dark:text-white/30">Hoac dung tool <strong>T</strong> de them text moi</p>
                      </div>
                    </>
                  )}

                  {/* Danger zone — always at bottom */}
                  {selectedDoc && (
                    <section className="px-3 py-3 mt-auto border-t border-black/6 dark:border-white/6">
                      <div className="space-y-1.5">
                        <button className="w-full h-[28px] flex items-center gap-2 px-3 rounded-md text-[10px] text-black/70 dark:text-white/70 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-left"><Download size={11}/>Tai xuong</button>
                        <button className="w-full h-[28px] flex items-center gap-2 px-3 rounded-md text-[10px] text-black/70 dark:text-white/70 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-left"><Share2 size={11}/>Chia se</button>
                        <button className="w-full h-[28px] flex items-center gap-2 px-3 rounded-md text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/15 hover:bg-red-100 dark:hover:bg-red-900/25 transition-colors text-left border border-red-200/50 dark:border-red-800/30"><Trash2 size={11}/>Thu hoi tai lieu</button>
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* ── INFO TAB ── */}
              {rightTab === "info" && selectedDoc && (
                <div className="px-3 py-3 space-y-4">
                  <div><p className="text-[10px] text-black/40 dark:text-white/40 mb-1 uppercase tracking-wider">Mo ta</p><p className="text-[12px] leading-relaxed">{selectedDoc.description}</p></div>
                  <div className="space-y-2.5">
                    {([["Tac gia",selectedDoc.author],["Mon hoc",selectedDoc.subject],["So trang",selectedDoc.pages.toString()],["Kich thuoc",selectedDoc.size],["Ngay tai",selectedDoc.uploadedAt]] as [string,string][]).map(([l,v]) => (
                      <div key={l}>
                        <p className="text-[10px] text-black/35 dark:text-white/35">{l}</p>
                        <p className="text-[12px]">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] text-black/40 dark:text-white/40 mb-2 uppercase tracking-wider">Nhan</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDoc.tags.map(tag => <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/6 dark:bg-white/6 text-[10px] text-black/60 dark:text-white/60 border border-black/8 dark:border-white/8"><Tag size={9}/>{tag}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-black/40 dark:text-white/40 mb-2 uppercase tracking-wider">Blocks (Trang 1)</p>
                    <div className="space-y-1">
                      {blocks.map((b, i) => (
                        <button key={b.id} onClick={() => setSelectedId(b.id)} className={`w-full text-left px-2 py-1.5 rounded-md text-[10px] transition-colors flex items-center justify-between gap-2 ${selectedId===b.id?"bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300":"text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                          <span className="truncate">{i+1}. [{b.tag}] {b.text.slice(0,30)}{b.text.length>30?"…":""}</span>
                          <span className="flex-none text-[9px] opacity-50">{b.style.fontSize}px</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
