"use client";
import React, { useState } from "react";
import Link from "next/link";
import { 
  Activity, Search, BookOpen,
  FileText, Bell, Menu, Sliders, Save, AlertTriangle, ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminQuotaPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [showLimitReached, setShowLimitReached] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert("Đã lưu cấu hình Quota thành công!");
    }, 800);
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
                    <Link href="/dashboard" className="flex items-center gap-3 text-[#3e4247] dark:text-white/70 hover:text-[#18b99f] dark:hover:text-[#18b99f] hover:bg-[#18b99f]/5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <FileText size={18} /> Quản lý tài liệu
                    </Link>
                    <Link href="/admin/monitoring" className="flex items-center gap-3 text-[#3e4247] dark:text-white/70 hover:text-[#18b99f] dark:hover:text-[#18b99f] hover:bg-[#18b99f]/5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Activity size={18} /> Monitoring
                    </Link>
                    <Link href="/admin/quota" className="flex items-center gap-3 text-[#18b99f] dark:text-[#18b99f] bg-[#18b99f]/10 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Sliders size={18} /> Cấu hình Quota
                    </Link>
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
              <span className="text-[#16b99e]">Home</span> <span>/</span> <span>Admin</span> <span>/</span> <span className="text-[#303238] dark:text-white/90">Cấu hình Quota</span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative hidden md:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Tìm kiếm hệ thống..." className="h-[40px] w-[220px] border border-[#ddd] dark:border-white/10 rounded-lg pl-10 pr-4 text-[14px] outline-none focus:border-[#18b99f] dark:bg-white/5 dark:text-white" />
            </div>
            <button className="relative text-[#a1a4a7] hover:text-[#303238] dark:hover:text-white bg-transparent border-0 cursor-pointer">
              <Bell size={20} />
            </button>
            <div className="w-[36px] h-[36px] rounded-full border-2 border-white dark:border-[#0c1219] shadow-md bg-gradient-to-tr from-[#8b5cf6] to-[#ec4899] flex items-center justify-center text-white font-medium text-[14px] cursor-pointer">
              AD
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          
          {/* Toast / Banner (T4.1.2.b) */}
          <AnimatePresence>
            {showWarning && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-100 border border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700/50 dark:text-amber-200 px-4 py-3 rounded-xl shadow-lg w-full max-w-md"
              >
                <AlertTriangle size={20} className="shrink-0" />
                <div className="flex-1 text-sm font-medium">Bạn đã sử dụng 85% giới hạn token của ngày hôm nay. Hãy sử dụng tiết kiệm nhé!</div>
                <button onClick={() => setShowWarning(false)} className="text-amber-600 hover:text-amber-900 dark:hover:text-amber-100">✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Limit Reached Screen (T4.1.2.c) */}
          <AnimatePresence>
            {showLimitReached && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 z-40 flex items-center justify-center bg-white/80 dark:bg-[#0c1219]/90 backdrop-blur-sm p-4"
              >
                <Card className="max-w-md w-full shadow-2xl border-destructive/20 bg-white dark:bg-[#1a2128]">
                  <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
                      <ShieldAlert size={32} />
                    </div>
                    <CardTitle className="text-xl">Đã đạt giới hạn yêu cầu</CardTitle>
                    <CardDescription className="text-base mt-2">
                      Bạn đã sử dụng hết hạn mức token cho phép trong ngày hôm nay.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center text-sm text-muted-foreground">
                    <p className="mb-4">Hệ thống áp dụng giới hạn này để đảm bảo tài nguyên được phân bổ công bằng cho tất cả sinh viên.</p>
                    <div className="bg-muted/50 p-4 rounded-lg flex flex-col gap-2">
                      <div className="flex justify-between">
                        <span>Hạn mức của bạn:</span>
                        <span className="font-medium text-foreground">100,000 tokens/ngày</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Thời gian làm mới:</span>
                        <span className="font-medium text-foreground">00:00 ngày mai</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-center gap-3">
                    <Button variant="outline" onClick={() => setShowLimitReached(false)}>Quay lại</Button>
                    <Button onClick={() => setShowLimitReached(false)}>Xem lịch sử trò chuyện</Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-w-[800px] mx-auto flex flex-col gap-6">
            
            <div className="flex flex-col gap-1 mb-2">
              <h1 className="text-[26px] font-medium text-[#303238] dark:text-white">Cấu hình Quota</h1>
              <p className="text-[#a1a4a8] dark:text-white/50 text-[14px]">Thiết lập hạn mức sử dụng tài nguyên (tokens, số lượt hỏi) cho người dùng.</p>
            </div>

            {/* Config Form (T4.1.2.a) */}
            <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Giới hạn theo Người dùng (User Limits)</CardTitle>
                <CardDescription>Giới hạn lượng token và request tối đa cho mỗi sinh viên trong 1 ngày.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium dark:text-white/90">Tokens tối đa / ngày</label>
                    <Input type="number" defaultValue={100000} className="font-mono" />
                    <p className="text-xs text-muted-foreground">Khoảng 75,000 từ tiếng Việt.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium dark:text-white/90">Số câu hỏi tối đa / ngày</label>
                    <Input type="number" defaultValue={50} className="font-mono" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Giới hạn theo Môn học (Subject Limits)</CardTitle>
                <CardDescription>Ngân sách token dành riêng cho từng môn học để tránh môn nào đó tiêu thụ quá mức.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border dark:border-white/10 rounded-lg">
                    <div className="flex items-center gap-3">
                      <BookOpen size={18} className="text-[#18b99f]" />
                      <span className="text-sm font-medium dark:text-white/90">Cấu trúc dữ liệu và giải thuật</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" defaultValue={5000000} className="w-32 font-mono h-8" />
                      <span className="text-sm text-muted-foreground">tokens/tháng</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 border dark:border-white/10 rounded-lg">
                    <div className="flex items-center gap-3">
                      <BookOpen size={18} className="text-[#3b82f6]" />
                      <span className="text-sm font-medium dark:text-white/90">Hệ cơ sở dữ liệu</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" defaultValue={4000000} className="w-32 font-mono h-8" />
                      <span className="text-sm text-muted-foreground">tokens/tháng</span>
                    </div>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-2 border-dashed">
                  + Thêm ngoại lệ môn học
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" className="px-6">Hủy</Button>
              <Button onClick={handleSave} disabled={isSaving} className="px-6 bg-[#18b99f] text-white hover:bg-[#15a38c]">
                {isSaving ? "Đang lưu..." : <><Save size={16} className="mr-2" /> Lưu cấu hình</>}
              </Button>
            </div>

            {/* DEMO ACTIONS FOR T4.1.2.b and T4.1.2.c */}
            <div className="mt-8 p-4 border border-dashed border-gray-300 dark:border-white/20 rounded-xl bg-gray-50/50 dark:bg-white/5">
              <h3 className="text-sm font-semibold mb-3 text-gray-500 uppercase tracking-wider">Demo UX Sinh Viên (T4.1.2.b & c)</h3>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setShowWarning(true)}>
                  Hiển thị Cảnh báo gần hết Quota (Toast/Banner)
                </Button>
                <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setShowLimitReached(true)}>
                  Hiển thị màn hình "Đã đạt giới hạn"
                </Button>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
