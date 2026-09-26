"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { 
  UploadCloud, FileText, CheckCircle, Clock, AlertTriangle, 
  Trash2, Search, Bell, Settings, User, Menu, File, FileUp, X, Eye, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

type DocumentStatus = 'pending' | 'processing' | 'ready' | 'rejected' | 'error';

interface Document {
  id: string;
  name: string;
  date: string;
  status: DocumentStatus;
  reviewer?: string;
  size: string;
}

const MOCK_DOCUMENTS: Document[] = [
  { id: '1', name: 'Giáo trình Kiến trúc máy tính.pdf', date: '26/09/2026', status: 'ready', reviewer: 'PGS. TS. Nguyễn Văn A', size: '2.4 MB' },
  { id: '2', name: 'Slide Bài 4 - Deep Learning.pptx', date: '26/09/2026', status: 'processing', size: '5.1 MB' },
  { id: '3', name: 'Bài tập thực hành CSDL.pdf', date: '25/09/2026', status: 'pending', size: '1.2 MB' },
  { id: '4', name: 'Tài liệu tham khảo lỗi.docx', date: '25/09/2026', status: 'error', size: '0.8 MB' },
];

export default function LecturerDashboard() {
  const { theme } = useTheme();
  const [documents, setDocuments] = useState<Document[]>(MOCK_DOCUMENTS);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [role, setRole] = useState<'lecturer' | 'reviewer'>('lecturer');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadCoursesAndDocs = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        
        const coursesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/dashboard/courses`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!coursesRes.ok) return;
        const coursesData = await coursesRes.json();
        const courseIds = coursesData.items || [];
        
        if (courseIds.length > 0) {
          const courseId = courseIds[0];
          const docsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/manage/versions?course_id=${courseId}`, {
             headers: { Authorization: `Bearer ${token}` }
          });
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            const mappedDocs: Document[] = (docsData.items || []).map((item: any) => ({
              id: item.version_id,
              name: item.title || item.original_filename || 'Unknown',
              date: item.updated_at ? new Date(item.updated_at).toLocaleDateString('vi-VN') : '',
              status: item.state === 'Published' ? 'ready' : (item.state === 'PendingApproval' ? 'pending' : (item.state === 'Processing' ? 'processing' : 'error')),
              reviewer: item.authors?.[0] || '',
              size: item.size_bytes ? (item.size_bytes / (1024 * 1024)).toFixed(1) + ' MB' : '0 MB',
            }));
            setDocuments(mappedDocs.length > 0 ? mappedDocs : MOCK_DOCUMENTS);
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      }
    };
    loadCoursesAndDocs();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const simulateUpload = (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    // Check file type
    const isValid = file.name.endsWith('.pdf') || file.name.endsWith('.pptx');
    if (!isValid) {
      alert("Chỉ hỗ trợ file PDF và PPTX");
      setIsUploading(false);
      return;
    }

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsUploading(false);
            const newDoc: Document = {
              id: Date.now().toString(),
              name: file.name,
              date: new Date().toLocaleDateString('vi-VN'),
              status: 'pending',
              size: (file.size / (1024 * 1024)).toFixed(1) + ' MB'
            };
            setDocuments([newDoc, ...documents]);
            setUploadProgress(0);
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      simulateUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      simulateUpload(e.target.files[0]);
    }
  };

  const handleDelete = (id: string) => {
    if(confirm("Bạn có chắc chắn muốn xóa tài liệu này?")) {
      setDocuments(documents.filter(d => d.id !== id));
    }
  };

  const getStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#18b99f]/10 text-[#18b99f] dark:bg-[#18b99f]/20 border border-[#18b99f]/20"><CheckCircle size={12} /> Đã duyệt</span>;
      case 'processing':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#3498db]/10 text-[#3498db] dark:bg-[#3498db]/20 border border-[#3498db]/20"><RefreshCw size={12} className="animate-spin" /> Đang OCR</span>;
      case 'pending':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#f39c12]/10 text-[#f39c12] dark:bg-[#f39c12]/20 border border-[#f39c12]/20"><Clock size={12} /> Chờ duyệt</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e74c3c]/10 text-[#e74c3c] dark:bg-[#e74c3c]/20 border border-[#e74c3c]/20"><AlertTriangle size={12} /> Lỗi trích xuất</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-[#f6f8f8] dark:bg-[#081018] text-[#303238] dark:text-[#f7f7f8] font-sans overflow-hidden">
      
      {/* Background Effect for Dark Mode */}
      <div className="hidden dark:block fixed inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 72% 47%, rgba(24, 185, 159, 0.08), transparent 28%), linear-gradient(180deg, rgba(5,10,16,.34), rgba(3,7,12,.43) 55%, rgba(3,7,12,.63))' }} />

      {/* SIDEBAR (LUNO Inspired) */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="bg-white dark:bg-[#0c1219]/95 border-r border-[#edf0ef] dark:border-white/5 flex flex-col shrink-0 z-20 shadow-[2px_0_10px_rgba(0,0,0,0.02)] overflow-hidden"
          >
            <div className="w-[280px] flex flex-col h-full">
              <div className="h-[80px] shrink-0 flex items-center justify-between px-6">
                <div className="text-[24px] font-semibold tracking-tight text-[#8f9397] dark:text-white/80">LUN<span className="text-[#18b99f]">O</span> Admin</div>
              </div>

              <div className="px-6 py-4 shrink-0">
                <button className="w-full h-[42px] border border-[#ddd] dark:border-white/10 rounded-full bg-white dark:bg-white/5 text-left px-4 text-[14px] flex items-center justify-between shadow-sm hover:shadow transition-shadow">
                  <span>Dự án EDU-04</span>
                  <span className="text-[10px]">▼</span>
                </button>
              </div>

              <div className="px-6 flex-1 overflow-y-auto pb-6">
                <div className="border border-dashed border-[#dce2e0] dark:border-white/10 rounded-2xl p-4 bg-white/50 dark:bg-white/5">
                  <div className="text-[11px] font-bold text-[#a1a4a7] dark:text-white/40 mb-1 tracking-wider">MAIN MENU</div>
                  
                  <div className="flex flex-col gap-1 mt-4">
                    <Link href="/" className="flex items-center gap-3 text-[#3e4247] dark:text-white/70 hover:text-[#18b99f] dark:hover:text-[#18b99f] hover:bg-[#18b99f]/5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Search size={18} className="text-[#18b99f]" /> Chat AI
                    </Link>
                    <Link href="/dashboard" className="flex items-center gap-3 text-[#18b99f] dark:text-[#18b99f] bg-[#18b99f]/10 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <FileText size={18} /> Quản lý tài liệu
                    </Link>
                    {role === 'reviewer' && (
                      <Link href="#" className="flex items-center gap-3 text-[#3e4247] dark:text-white/70 hover:text-[#18b99f] dark:hover:text-[#18b99f] hover:bg-[#18b99f]/5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                        <CheckCircle size={18} /> Hàng đợi duyệt
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 overflow-hidden">
        
        {/* TOPBAR */}
        <header className="h-[80px] bg-white/80 dark:bg-[#0c1219]/80 backdrop-blur-md border-b border-[#edf0ef] dark:border-white/5 flex items-center px-8 justify-between shrink-0 shadow-sm relative z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-[#21a9c0] dark:text-[#18b99f] hover:bg-[#18b99f]/10 p-2 rounded-lg transition-colors bg-transparent border-0 cursor-pointer flex items-center justify-center -ml-2">
              <Menu size={24} />
            </button>
            <div className="text-[15px] font-medium text-[#9b9da0] dark:text-white/50 flex items-center gap-2">
              <span className="text-[#16b99e]">Home</span> <span>/</span> <span>Giảng viên</span> <span>/</span> <span className="text-[#303238] dark:text-white/90">Quản lý tài liệu</span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 bg-[#f6f8f8] dark:bg-white/5 p-1 rounded-lg border border-[#ddd] dark:border-white/10">
              <button 
                onClick={() => setRole('lecturer')}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer border-0 ${role === 'lecturer' ? 'bg-white dark:bg-[#18b99f] text-[#303238] dark:text-white shadow-sm' : 'bg-transparent text-[#9b9da2] hover:text-[#303238] dark:text-white/50 dark:hover:text-white'}`}
              >
                Giảng viên
              </button>
              <button 
                onClick={() => setRole('reviewer')}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer border-0 ${role === 'reviewer' ? 'bg-white dark:bg-[#18b99f] text-[#303238] dark:text-white shadow-sm' : 'bg-transparent text-[#9b9da2] hover:text-[#303238] dark:text-white/50 dark:hover:text-white'}`}
              >
                Người duyệt
              </button>
            </div>

            <div className="relative hidden md:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Tìm kiếm tài liệu..." className="h-[40px] w-[220px] border border-[#ddd] dark:border-white/10 rounded-lg pl-10 pr-4 text-[14px] outline-none focus:border-[#18b99f] dark:bg-white/5 dark:text-white" />
            </div>
            <button className="relative text-[#a1a4a7] hover:text-[#303238] dark:hover:text-white bg-transparent border-0 cursor-pointer">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-[#0c1219]"></span>
            </button>
            <div className="w-[36px] h-[36px] rounded-full border-2 border-white dark:border-[#0c1219] shadow-md bg-gradient-to-tr from-[#3498db] to-[#18b99f] flex items-center justify-center text-white font-medium text-[14px] cursor-pointer">
              GV
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[1000px] mx-auto">
            
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h1 className="text-[26px] font-medium text-[#303238] dark:text-white mb-1">Tài liệu của tôi</h1>
                <p className="text-[#a1a4a8] dark:text-white/50 text-[14px]">Tải lên và theo dõi trạng thái số hóa tài liệu học liệu.</p>
              </div>
            </div>

            {/* UPLOAD ZONE */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-8 border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${
                isDragging ? 'border-[#18b99f] bg-[#18b99f]/5 scale-[1.02]' : 'border-[#dce2e0] dark:border-white/10 bg-white/50 dark:bg-white/5 hover:border-[#18b99f]/50 hover:bg-white dark:hover:bg-white/10'
              }`}
            >
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept=".pdf,.pptx" />
              
              {!isUploading ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-[#18b99f]/10 text-[#18b99f] flex items-center justify-center mb-4">
                    <FileUp size={28} />
                  </div>
                  <h3 className="text-[18px] font-medium text-[#303238] dark:text-white mb-2">Kéo thả file vào đây hoặc Click để chọn file</h3>
                  <p className="text-[14px] text-[#a1a4a8] dark:text-white/50">Hỗ trợ định dạng PDF, PPTX (Tối đa 50MB)</p>
                </>
              ) : (
                <div className="w-full max-w-[400px]">
                  <div className="flex justify-between text-[14px] mb-2 font-medium">
                    <span className="dark:text-white">Đang tải lên...</span>
                    <span className="text-[#18b99f]">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#eee] dark:bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-[#3498db] to-[#18b99f]" 
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* DOCUMENTS TABLE */}
            <div className="bg-white dark:bg-[#0c1219]/80 backdrop-blur border border-[#ddd] dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-[#ddd] dark:border-white/10 flex justify-between items-center bg-[#fcfdfd] dark:bg-white/5">
                <h3 className="text-[16px] font-medium m-0 dark:text-white">Danh sách đã tải lên</h3>
                <div className="text-[13px] text-gray-500">{documents.length} tài liệu</div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#edf0ef] dark:border-white/5 text-[13px] text-[#a1a4a8] dark:text-white/40 uppercase tracking-wider">
                      <th className="py-4 px-6 font-medium">Tên file</th>
                      <th className="py-4 px-6 font-medium">Ngày tải</th>
                      <th className="py-4 px-6 font-medium">Kích thước</th>
                      <th className="py-4 px-6 font-medium">Trạng thái</th>
                      <th className="py-4 px-6 font-medium">Người duyệt</th>
                      <th className="py-4 px-6 font-medium text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {documents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-gray-500">Chưa có tài liệu nào.</td>
                        </tr>
                      )}
                      {documents.map((doc) => (
                        <motion.tr 
                          key={doc.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="border-b border-[#edf0ef] dark:border-white/5 hover:bg-[#f9fafa] dark:hover:bg-white/5 transition-colors group"
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center shrink-0">
                                <FileText size={16} />
                              </div>
                              <span className="text-[14px] font-medium text-[#303238] dark:text-white/90 max-w-[200px] truncate">{doc.name}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-[13px] text-[#7c8388] dark:text-white/60">{doc.date}</td>
                          <td className="py-4 px-6 text-[13px] text-[#7c8388] dark:text-white/60">{doc.size}</td>
                          <td className="py-4 px-6">{getStatusBadge(doc.status)}</td>
                          <td className="py-4 px-6 text-[13px] text-[#7c8388] dark:text-white/60">{doc.reviewer || '-'}</td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(doc.status === 'processing' || doc.status === 'ready') && (
                                <button onClick={() => setPreviewDoc(doc)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded" title="Preview kết quả">
                                  <Eye size={16} />
                                </button>
                              )}
                              {(doc.status === 'pending' || doc.status === 'error') && (
                                <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded" title="Hủy/Xóa">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      </main>

      {/* PREVIEW MODAL */}
      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPreviewDoc(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-4xl bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="h-14 border-b border-gray-200 dark:border-white/10 px-6 flex items-center justify-between bg-gray-50 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-[15px] dark:text-white">Preview Trích Xuất: {previewDoc.name}</h3>
                  {getStatusBadge(previewDoc.status)}
                </div>
                <button onClick={() => setPreviewDoc(null)} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
              
              <div className="flex-1 flex overflow-hidden">
                <div className="w-1/2 border-r border-gray-200 dark:border-white/10 p-6 bg-gray-100 dark:bg-black/20 flex flex-col items-center justify-center overflow-y-auto text-gray-500">
                   <FileText size={48} className="mb-4 opacity-20" />
                   <p className="text-[13px]">Bản xem trước PDF sẽ hiển thị ở đây</p>
                </div>
                <div className="w-1/2 p-6 overflow-y-auto bg-white dark:bg-transparent">
                  <div className="prose dark:prose-invert text-[14px]">
                    <h4 className="text-[#18b99f]">Kết quả OCR (Trang 1)</h4>
                    <p>Học máy (Machine Learning) là một lĩnh vực con của Trí tuệ nhân tạo (AI), nghiên cứu các thuật toán cho phép máy tính học từ dữ liệu...</p>
                    <br/>
                    <h4 className="text-[#18b99f]">Kết quả OCR (Trang 2)</h4>
                    <p>Mạng nơ-ron nhân tạo (ANN) lấy cảm hứng từ cấu trúc não bộ sinh học...</p>
                  </div>
                </div>
              </div>
              
              <div className="h-16 border-t border-gray-200 dark:border-white/10 px-6 flex items-center justify-end gap-3 bg-gray-50 dark:bg-white/5">
                <button onClick={() => setPreviewDoc(null)} className="px-4 py-2 rounded-lg text-[14px] font-medium border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  Đóng
                </button>
                <button onClick={() => { alert('Đã gửi yêu cầu duyệt!'); setPreviewDoc(null); }} className="px-4 py-2 rounded-lg text-[14px] font-medium bg-[#18b99f] text-white hover:bg-[#15a38c] shadow-sm transition-colors">
                  Gửi duyệt
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
