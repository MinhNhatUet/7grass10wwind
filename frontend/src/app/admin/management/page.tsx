"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Activity, Search, BookOpen, Users, ShieldAlert,
  FileText, Bell, Menu, Sliders, Shield, History, Lock, Edit, Plus, Check, X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API, responseError } from "@/lib/api-errors";

const TABS = [
  { id: "users", label: "Quản lý Người dùng", icon: Users },
  { id: "courses", label: "Quản lý Môn học", icon: BookOpen },
  { id: "documents", label: "Khóa khẩn cấp", icon: Lock },
  { id: "audit", label: "Audit Logs", icon: History },
];

export default function AdminManagementPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("users");

  const [users, setUsers] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");

  const loadData = async (tab: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      if (tab === "users") {
        const res = await fetch(`${API}/admin/users`, { headers });
        if (res.ok) setUsers((await res.json()).items);
      } else if (tab === "courses") {
        const res = await fetch(`${API}/admin/courses`, { headers });
        if (res.ok) {
          const items = (await res.json()).items;
          setCourses(items);
          if (items.length > 0 && !selectedCourse) setSelectedCourse(items[0].id);
        }
      } else if (tab === "audit") {
        const res = await fetch(`${API}/admin/audit?limit=100`, { headers });
        if (res.ok) setAuditLogs((await res.json()).items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "documents" && selectedCourse) {
      const loadDocs = async () => {
        setLoading(true);
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`${API}/admin/documents?course_id=${selectedCourse}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) setDocuments((await res.json()).items);
        } catch (e) {}
        setLoading(false);
      }
      loadDocs();
    }
  }, [activeTab, selectedCourse]);

  const handleToggleLock = async (docId: string, currentLock: boolean) => {
    const reason = prompt(currentLock ? "Lý do mở khóa:" : "Lý do khóa khẩn cấp:");
    if (!reason) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/admin/documents/${docId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locked: !currentLock, reason })
      });
      if (res.ok) {
        const updated = await res.json();
        setDocuments(docs => docs.map(d => d.id === docId ? { ...d, emergency_locked: updated.emergency_locked } : d));
      } else {
        alert("Lỗi: " + (await res.json()).error?.message);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateUserStatus = async (userId: string, newStatus: string) => {
    const reason = prompt(`Lý do đổi trạng thái thành ${newStatus}?`);
    if (!reason) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, reason })
      });
      if (res.ok) loadData("users");
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex h-screen bg-[#f6f8f8] dark:bg-[#081018] text-[#303238] dark:text-[#f7f7f8] font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="bg-white dark:bg-[#0c1219]/95 border-r border-[#edf0ef] dark:border-white/5 flex flex-col shrink-0 z-20 shadow-[2px_0_10px_rgba(0,0,0,0.02)] overflow-hidden"
          >
            <div className="w-[280px] flex flex-col h-full">
              <div className="h-[80px] shrink-0 flex items-center justify-between px-6">
                <div className="text-[24px] font-semibold tracking-tight text-[#8f9397] dark:text-white/80">LUN<span className="text-[#18b99f]">O</span> Admin</div>
              </div>

              <div className="px-6 flex-1 overflow-y-auto pb-6 mt-4">
                <div className="border border-dashed border-[#dce2e0] dark:border-white/10 rounded-2xl p-4 bg-white/50 dark:bg-white/5">
                  <div className="text-[11px] font-bold text-[#a1a4a7] dark:text-white/40 mb-1 tracking-wider">MAIN MENU</div>
                  
                  <div className="flex flex-col gap-1 mt-4">
                    <Link href="/admin/monitoring" className="flex items-center gap-3 text-[#3e4247] dark:text-white/70 hover:text-[#18b99f] hover:bg-[#18b99f]/5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Activity size={18} /> Monitoring
                    </Link>
                    <Link href="/admin/quota" className="flex items-center gap-3 text-[#3e4247] dark:text-white/70 hover:text-[#18b99f] hover:bg-[#18b99f]/5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Sliders size={18} /> Cấu hình Quota
                    </Link>
                    <Link href="/admin/management" className="flex items-center gap-3 text-[#18b99f] dark:text-[#18b99f] bg-[#18b99f]/10 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">
                      <Shield size={18} /> Quản trị hệ thống
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
        <header className="h-[80px] bg-white/80 dark:bg-[#0c1219]/80 backdrop-blur-md border-b border-[#edf0ef] dark:border-white/5 flex items-center px-8 justify-between shrink-0 shadow-sm relative z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-[#21a9c0] dark:text-[#18b99f] hover:bg-[#18b99f]/10 p-2 rounded-lg transition-colors bg-transparent border-0 cursor-pointer flex items-center justify-center -ml-2">
              <Menu size={24} />
            </button>
            <div className="text-[15px] font-medium text-[#9b9da0] dark:text-white/50 flex items-center gap-2">
              <span className="text-[#16b99e]">Home</span> <span>/</span> <span>Admin</span> <span>/</span> <span className="text-[#303238] dark:text-white/90">Quản trị</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
            
            <div className="flex flex-col gap-1 mb-2">
              <h1 className="text-[26px] font-medium text-[#303238] dark:text-white">Quản trị hệ thống</h1>
              <p className="text-[#a1a4a8] dark:text-white/50 text-[14px]">Quản lý người dùng, môn học, khóa khẩn cấp và theo dõi nhật ký hoạt động.</p>
            </div>

            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-white/10 pb-px">
              {TABS.map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-[#18b99f] text-[#18b99f]' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  <tab.icon size={16} /> {tab.label}
                </button>
              ))}
            </div>

            {loading && <div className="p-4 text-center text-sm text-gray-500">Đang tải dữ liệu...</div>}

            {!loading && activeTab === "users" && (
              <Card className="bg-white dark:bg-[#1a2128]/60 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Danh sách tài khoản</CardTitle>
                    <CardDescription>Quản lý role và trạng thái người dùng.</CardDescription>
                  </div>
                  <Button className="bg-[#18b99f] hover:bg-[#15a38c]"><Plus size={16} className="mr-2" /> Tạo User</Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 rounded-tl-lg">Login ID</th>
                          <th className="px-4 py-3">Tên hiển thị</th>
                          <th className="px-4 py-3">Vai trò</th>
                          <th className="px-4 py-3">Trạng thái</th>
                          <th className="px-4 py-3 rounded-tr-lg text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                            <td className="px-4 py-3 font-medium">{u.login_id}</td>
                            <td className="px-4 py-3">{u.display_name}</td>
                            <td className="px-4 py-3"><Badge variant="outline">{u.role}</Badge></td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-[11px] font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {u.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleUpdateUserStatus(u.id, u.status === 'active' ? 'locked' : 'active')} className="text-blue-500 hover:underline mr-3">
                                {u.status === 'active' ? 'Khóa' : 'Mở khóa'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && activeTab === "courses" && (
              <Card className="bg-white dark:bg-[#1a2128]/60 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Danh sách môn học</CardTitle>
                    <CardDescription>Các học phần đang có trên hệ thống.</CardDescription>
                  </div>
                  <Button className="bg-[#18b99f] hover:bg-[#15a38c]"><Plus size={16} className="mr-2" /> Thêm Môn</Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map(c => (
                      <div key={c.id} className="border border-gray-200 dark:border-white/10 rounded-xl p-4 bg-gray-50/50 dark:bg-white/5">
                        <div className="font-semibold text-lg">{c.name}</div>
                        <div className="text-sm text-gray-500 mt-1">Mã: {c.code || c.id} • Kỳ: {c.term || 'N/A'}</div>
                        <Badge className="mt-3 bg-blue-100 text-blue-700 hover:bg-blue-100">{c.status}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && activeTab === "documents" && (
              <Card className="bg-white dark:bg-[#1a2128]/60 shadow-sm border-red-200">
                <CardHeader>
                  <CardTitle className="text-lg text-red-600 flex items-center gap-2"><ShieldAlert size={20} /> Khóa khẩn cấp tài liệu</CardTitle>
                  <CardDescription>Khóa ngay lập tức các tài liệu có nội dung sai lệch nghiêm trọng, dừng hiển thị trên Hub và Chat.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <label className="text-sm font-medium mb-1 block">Chọn môn học</label>
                    <select 
                      value={selectedCourse} 
                      onChange={e => setSelectedCourse(e.target.value)}
                      className="w-full max-w-md h-[40px] border border-[#ddd] dark:border-white/10 rounded-lg px-3 text-[14px] outline-none dark:bg-[#0c1219]"
                    >
                      <option value="">-- Chọn môn học --</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    {documents.length === 0 && selectedCourse && <p className="text-sm text-gray-500">Không có tài liệu nào.</p>}
                    {documents.map(d => (
                      <div key={d.id} className={`flex items-center justify-between p-3 rounded-lg border ${d.emergency_locked ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-white border-gray-200 dark:bg-white/5 dark:border-white/10'}`}>
                        <div>
                          <div className="font-medium text-sm">{d.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{d.doc_type}</div>
                        </div>
                        <Button 
                          variant={d.emergency_locked ? "default" : "destructive"} 
                          size="sm"
                          onClick={() => handleToggleLock(d.id, d.emergency_locked)}
                        >
                          {d.emergency_locked ? "Mở khóa" : "Khóa khẩn cấp"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && activeTab === "audit" && (
              <Card className="bg-white dark:bg-[#1a2128]/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Nhật ký hệ thống (Audit Logs)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 rounded-tl-lg">Thời gian</th>
                          <th className="px-4 py-3">Hành động</th>
                          <th className="px-4 py-3">Đối tượng</th>
                          <th className="px-4 py-3">Thực hiện bởi</th>
                          <th className="px-4 py-3 rounded-tr-lg">Lý do</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log, idx) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString()}</td>
                            <td className="px-4 py-3 font-medium text-blue-600">{log.action}</td>
                            <td className="px-4 py-3">{log.object_type}: {log.object_id}</td>
                            <td className="px-4 py-3">{log.actor}</td>
                            <td className="px-4 py-3 text-gray-500">{log.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
