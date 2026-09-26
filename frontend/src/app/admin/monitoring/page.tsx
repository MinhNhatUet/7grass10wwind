"use client";
import React, { useState } from "react";
import Link from "next/link";
import { 
  Activity, Coins, Zap, Users, Search, BookOpen,
  FileText, CheckCircle, Bell, Menu
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Mock Data
const latencyData = [
  { time: "08:00", p50: 120, p95: 350 },
  { time: "09:00", p50: 135, p95: 410 },
  { time: "10:00", p50: 180, p95: 520 },
  { time: "11:00", p50: 150, p95: 380 },
  { time: "12:00", p50: 110, p95: 290 },
  { time: "13:00", p50: 140, p95: 420 },
  { time: "14:00", p50: 160, p95: 490 },
];

const usageData = [
  { day: "T2", tokens: 120000, cost: 2.4 },
  { day: "T3", tokens: 150000, cost: 3.0 },
  { day: "T4", tokens: 200000, cost: 4.0 },
  { day: "T5", tokens: 180000, cost: 3.6 },
  { day: "T6", tokens: 220000, cost: 4.4 },
  { day: "T7", tokens: 90000, cost: 1.8 },
  { day: "CN", tokens: 80000, cost: 1.6 },
];

const topSubjects = [
  { id: 1, name: "Cấu trúc dữ liệu và giải thuật", requests: 1245 },
  { id: 2, name: "Hệ cơ sở dữ liệu", requests: 980 },
  { id: 3, name: "Lập trình hướng đối tượng", requests: 850 },
  { id: 4, name: "Trí tuệ nhân tạo", requests: 720 },
  { id: 5, name: "Mạng máy tính", requests: 560 },
];

const topQuestions = [
  { id: 1, query: "Giải thích thuật toán Dijkstra?", count: 145, subject: "CTDL&GT" },
  { id: 2, query: "Sự khác nhau giữa INNER JOIN và LEFT JOIN?", count: 120, subject: "HCSDL" },
  { id: 3, query: "Tính đa hình trong OOP là gì?", count: 98, subject: "OOP" },
  { id: 4, query: "Cách hoạt động của giao thức TCP?", count: 85, subject: "Mạng máy tính" },
  { id: 5, query: "Mạng nơ-ron nhân tạo là gì?", count: 76, subject: "TTNT" },
];

export default function AdminMonitoringPage() {
  const { theme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
                    <Link href="/admin/monitoring" className="flex items-center gap-3 text-[#18b99f] dark:text-[#18b99f] bg-[#18b99f]/10 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Activity size={18} /> Monitoring
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
              <span className="text-[#16b99e]">Home</span> <span>/</span> <span>Admin</span> <span>/</span> <span className="text-[#303238] dark:text-white/90">Monitoring</span>
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
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
            
            <div className="flex flex-col gap-1 mb-2">
              <h1 className="text-[26px] font-medium text-[#303238] dark:text-white">Dashboard Vận Hành</h1>
              <p className="text-[#a1a4a8] dark:text-white/50 text-[14px]">Theo dõi hiệu suất hệ thống, chi phí và tần suất sử dụng tài nguyên.</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 border-b-0">
                  <CardTitle className="text-sm font-medium">Tổng Tokens (Hôm nay)</CardTitle>
                  <div className="w-8 h-8 rounded-full bg-[#8b5cf6]/10 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-[#8b5cf6]" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-white">220,000</div>
                  <p className="text-xs text-[#18b99f] font-medium mt-1">+12% so với hôm qua</p>
                </CardContent>
              </Card>
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 border-b-0">
                  <CardTitle className="text-sm font-medium">Ước tính chi phí</CardTitle>
                  <div className="w-8 h-8 rounded-full bg-[#ec4899]/10 flex items-center justify-center">
                    <Coins className="h-4 w-4 text-[#ec4899]" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-white">$4.40</div>
                  <p className="text-xs text-[#f59e0b] font-medium mt-1">Đạt 45% hạn mức ngày</p>
                </CardContent>
              </Card>
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 border-b-0">
                  <CardTitle className="text-sm font-medium">Độ trễ trung bình (p50)</CardTitle>
                  <div className="w-8 h-8 rounded-full bg-[#18b99f]/10 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-[#18b99f]" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-white">140ms</div>
                  <p className="text-xs text-[#18b99f] font-medium mt-1">-15ms so với hôm qua</p>
                </CardContent>
              </Card>
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 border-b-0">
                  <CardTitle className="text-sm font-medium">Lượt yêu cầu</CardTitle>
                  <div className="w-8 h-8 rounded-full bg-[#3b82f6]/10 flex items-center justify-center">
                    <Users className="h-4 w-4 text-[#3b82f6]" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold dark:text-white">1,245</div>
                  <p className="text-xs text-[#18b99f] font-medium mt-1">+20% so với giờ trước</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Latency Chart */}
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm col-span-1">
                <CardHeader>
                  <CardTitle className="dark:text-white text-[16px]">Độ trễ hệ thống (Latency)</CardTitle>
                  <CardDescription>Biểu đồ p50 và p95 theo thời gian (ms)</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={latencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                      <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                      <Line type="monotone" name="p50 (Trung vị)" dataKey="p50" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} activeDot={{ r: 6 }} />
                      <Line type="monotone" name="p95 (Đỉnh)" dataKey="p95" stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: "#ef4444" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Token Usage Chart */}
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm col-span-1">
                <CardHeader>
                  <CardTitle className="dark:text-white text-[16px]">Token Usage & Chi phí</CardTitle>
                  <CardDescription>Lượng token sử dụng trong 7 ngày gần nhất</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                      <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <RechartsTooltip 
                        cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                      <Bar name="Số lượng Tokens" dataKey="tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Tables row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Subjects */}
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-white text-[16px]">
                    <BookOpen className="h-5 w-5 text-[#18b99f]" />
                    Môn học phổ biến nhất
                  </CardTitle>
                  <CardDescription>Top 5 môn học có lượng truy vấn cao nhất</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topSubjects.map((subject, index) => (
                      <div key={subject.id} className="flex items-center justify-between p-3 bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 hover:border-[#18b99f]/30 transition-colors shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#18b99f]/10 text-[#18b99f] text-[13px] font-bold">
                            {index + 1}
                          </div>
                          <span className="font-medium text-[14px] dark:text-white/90">{subject.name}</span>
                        </div>
                        <Badge variant="secondary" className="font-mono bg-gray-100 dark:bg-black/20 text-gray-600 dark:text-gray-300">
                          {subject.requests.toLocaleString()} reqs
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Questions */}
              <Card className="bg-white/60 dark:bg-[#1a2128]/60 backdrop-blur border-white/20 dark:border-white/5 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-white text-[16px]">
                    <Search className="h-5 w-5 text-[#3b82f6]" />
                    Câu hỏi thường gặp
                  </CardTitle>
                  <CardDescription>Những câu hỏi được sinh viên hỏi nhiều nhất</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topQuestions.map((q) => (
                      <div key={q.id} className="flex flex-col gap-2 p-3 bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 hover:border-[#3b82f6]/30 transition-colors shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <span className="font-medium text-[14px] leading-tight line-clamp-2 dark:text-white/90">{q.query}</span>
                          <Badge variant="outline" className="shrink-0 whitespace-nowrap bg-background text-[12px]">
                            {q.count} lần
                          </Badge>
                        </div>
                        <div className="text-[12px] text-gray-400 dark:text-white/40 flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5" /> {q.subject}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
