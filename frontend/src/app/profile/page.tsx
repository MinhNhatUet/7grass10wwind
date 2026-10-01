"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  LogOut,
  Moon,
  Sun,
  ArrowLeft,
  BookOpen,
  User,
  ShieldCheck,
  GraduationCap
} from "lucide-react";
import { motion } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ROLES_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  student: { label: "Sinh viên", icon: <GraduationCap size={16} />, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  lecturer: { label: "Giảng viên", icon: <BookOpen size={16} />, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  reviewer: { label: "Người duyệt", icon: <ShieldCheck size={16} />, color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  admin: { label: "Quản trị viên", icon: <User size={16} />, color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
};

interface Course {
  id: string;
  name: string;
  code?: string;
  term?: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      async function loadUserData() {
        try {
          const [meRes, coursesRes] = await Promise.all([
            fetch(`${API}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API}/api/v1/me/courses`, { headers: { Authorization: `Bearer ${token}` } }),
          ]);

          if (meRes.ok) {
            const data = await meRes.json();
            setUser(data.user);
          }
          if (coursesRes.ok) {
            const data = await coursesRes.json();
            setCourses(data.items || []);
          }
        } catch {
          // ignore
        } finally {
          setLoading(false);
        }
      }
      loadUserData();
    } else {
      setLoading(false);
      window.location.replace("/login");
    }
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        await fetch(`${API}/api/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/login");
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const roleConfig = ROLES_MAP[user?.role] || { label: user?.role || "Người dùng", icon: <User size={16} />, color: "text-slate-500 bg-slate-500/10 border-slate-500/20" };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-border/40 bg-background/80 backdrop-blur-md px-6">
        <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
          <span className="font-medium text-sm">Quay lại Hội thoại</span>
        </Link>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="space-y-8"
        >
          {/* Header Card */}
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 sm:p-10 shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50" />
            <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-8">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-4xl font-bold text-primary-foreground shadow-xl ring-4 ring-background">
                {user?.display_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 text-center sm:text-left space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">{user?.display_name || "Người dùng"}</h1>
                <p className="text-muted-foreground text-sm font-medium">@{user?.login_id || "username"}</p>
                <div className="pt-2 flex flex-wrap justify-center sm:justify-start gap-2">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${roleConfig.color}`}>
                    {roleConfig.icon}
                    {roleConfig.label}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Courses Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
              className="md:col-span-2 rounded-3xl border border-border/50 bg-card p-6 shadow-sm flex flex-col"
            >
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <BookOpen size={20} className="text-primary" />
                Môn học của bạn
              </h2>
              {courses.length > 0 ? (
                <div className="grid gap-3">
                  {courses.map((course, idx) => (
                    <div key={course.id || idx} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/40">
                      <div>
                        <h3 className="font-semibold text-sm">{course.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{course.id}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                    <BookOpen size={24} />
                  </div>
                  <p className="text-sm text-muted-foreground">Bạn chưa được gán vào môn học nào.</p>
                </div>
              )}
            </motion.div>

            {/* Settings Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="rounded-3xl border border-border/50 bg-card p-6 shadow-sm flex flex-col gap-2"
            >
              <h2 className="text-lg font-bold mb-2">Cài đặt</h2>
              
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex w-full items-center justify-between rounded-2xl p-4 text-sm font-medium hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/50"
              >
                <div className="flex items-center gap-3 text-muted-foreground">
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                  <span>Giao diện</span>
                </div>
                <span className="text-foreground">{theme === "dark" ? "Tối" : "Sáng"}</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-between rounded-2xl p-4 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
              >
                <div className="flex items-center gap-3">
                  <LogOut size={18} />
                  <span>Đăng xuất</span>
                </div>
              </button>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
