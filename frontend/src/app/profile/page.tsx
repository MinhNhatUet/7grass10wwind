"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Clock,
  Users,
  UserCheck,
  FileText,
  CreditCard,
  BarChart2,
  Settings,
  HelpCircle,
  ChevronDown,
  Pencil,
  Bell,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  ShieldCheck,
  BookOpen,
  Check,
  Building2,
  Laptop,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ROLES_MAP: Record<string, { title: string; dept: string; label: string }> = {
  student: { title: "Sinh viên", dept: "Khoa Học thuật", label: "Sinh viên" },
  lecturer: { title: "Giảng viên", dept: "Khoa Giảng dạy", label: "Giảng viên" },
  reviewer: { title: "Phản biện", dept: "Hội đồng Phản biện", label: "Phản biện" },
  admin: { title: "Quản trị viên", dept: "Quản trị Hệ thống", label: "Quản trị" },
};

const ROLE_FIELDS: Record<string, { idLabel: string; accountLabel: string; breadcrumb: string[]; tabName: string }> = {
  student: { idLabel: "Mã sinh viên:", accountLabel: "Tài khoản:", breadcrumb: ["Sinh viên", "Danh sách", "Chi tiết"], tabName: "Hồ sơ sinh viên" },
  lecturer: { idLabel: "Mã giảng viên:", accountLabel: "Tài khoản:", breadcrumb: ["Giảng viên", "Danh sách", "Chi tiết"], tabName: "Hồ sơ giảng viên" },
  reviewer: { idLabel: "Mã phản biện:", accountLabel: "Tài khoản:", breadcrumb: ["Phản biện", "Danh sách", "Chi tiết"], tabName: "Hồ sơ phản biện" },
  admin: { idLabel: "Mã quản trị:", accountLabel: "Tài khoản:", breadcrumb: ["Quản trị", "Danh sách", "Chi tiết"], tabName: "Hồ sơ quản trị" },
};

interface Course {
  id: string;
  name: string;
  code?: string;
  term?: string;
  can_upload: boolean;
  can_review: boolean;
}

interface PersonalInfo {
  gender: string;
  dob: string;
  identifyCode: string;
  hometown: string;
  nationality: string;
  religion: string;
  language: string;
  maritalStatus: string;
  permanentAddress: string;
  currentAddress: string;
}

interface EducationItem {
  degree: string;
  period: string;
  school: string;
}

interface AccountInfo {
  bankAccount: string;
  accountName: string;
  bank: string;
  taxCode: string;
  insuranceCode: string;
}

interface HeaderInfo {
  name: string;
  title: string;
  department: string;
  staffId: string;
  staffAccount: string;
  phone: string;
  email: string;
}

const DEFAULT_HEADER: HeaderInfo = {
  name: "Nguyễn Minh Hằng",
  title: "Kỹ sư phần mềm",
  department: "Phòng Phát triển Sản phẩm",
  staffId: "SJ53862",
  staffAccount: "hangntm1",
  phone: "0913 854 235",
  email: "hangntm@sjlabel.com",
};

const DEFAULT_PERSONAL: PersonalInfo = {
  gender: "Nữ",
  dob: "05/03/1996",
  identifyCode: "3234611342",
  hometown: "TP. Hải Dương",
  nationality: "Việt Nam",
  religion: "Không",
  language: "Tiếng Việt, Tiếng Anh",
  maritalStatus: "Độc thân",
  permanentAddress: "5 Nguyễn Chí Thanh, Tân Bình, Hải Dương",
  currentAddress: "29 Nguyễn Ngọc Doãn, Đống Đa, Hà Nội",
};

const DEFAULT_EDUCATION: EducationItem[] = [
  {
    degree: "Cử nhân Hệ thống Thông tin Quản lý",
    period: "2014-2018",
    school: "Đại học Kinh tế Quốc dân",
  },
  {
    degree: "Chứng chỉ Thiết kế Đồ họa",
    period: "2018-2019",
    school: "Đại học FPT Arena",
  },
];

const DEFAULT_ACCOUNT: AccountInfo = {
  bankAccount: "02520613401",
  accountName: "NGUYỄN THỊ MINH HẰNG",
  bank: "TPBank Duy Tân",
  taxCode: "8456120546",
  insuranceCode: "8456120546",
};

const TABS_DEFAULT = [
  "Hồ sơ cá nhân",
  "Thông tin học tập",
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState("Hồ sơ cá nhân");
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo>(DEFAULT_HEADER);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>(DEFAULT_PERSONAL);
  const [educationList, setEducationList] = useState<EducationItem[]>(DEFAULT_EDUCATION);
  const [accountInfo, setAccountInfo] = useState<AccountInfo>(DEFAULT_ACCOUNT);

  const [courses, setCourses] = useState<Course[]>([]);
  const [sessionExpiry, setSessionExpiry] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Edit Modals state
  const [editingModal, setEditingModal] = useState<"personal" | "education" | "account" | "header" | null>(null);
  const [editPersonalForm, setEditPersonalForm] = useState<PersonalInfo>(DEFAULT_PERSONAL);
  const [editEducationForm, setEditEducationForm] = useState<EducationItem[]>(DEFAULT_EDUCATION);
  const [editAccountForm, setEditAccountForm] = useState<AccountInfo>(DEFAULT_ACCOUNT);
  const [editHeaderForm, setEditHeaderForm] = useState<HeaderInfo>(DEFAULT_HEADER);

  const { resolvedTheme: theme, setTheme } = useTheme();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Derived dynamic labels based on role
  const roleFields = ROLE_FIELDS[userRole] || ROLE_FIELDS.student;
  const TABS = [roleFields.tabName, "Thông tin học tập"];

  useEffect(() => {
    if (userRole && ROLE_FIELDS[userRole]) {
      setActiveTab(ROLE_FIELDS[userRole].tabName);
    }
  }, [userRole]);

  useEffect(() => {
    // Load persisted local customizations if any
    try {
      const savedProfile = localStorage.getItem("custom_user_profile");
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        if (parsed.header) setHeaderInfo(parsed.header);
        if (parsed.personal) setPersonalInfo(parsed.personal);
        if (parsed.education) setEducationList(parsed.education);
        if (parsed.account) setAccountInfo(parsed.account);
      }
    } catch {
      // Ignore
    }

    // Try fetching authentic user data if token is stored
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      const controller = new AbortController();
      async function loadUserData() {
        try {
          setLoading(true);
          const [meRes, coursesRes] = await Promise.all([
            fetch(`${API}/api/v1/me`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            }),
            fetch(`${API}/api/v1/me/courses`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            }),
          ]);

          if (meRes.ok) {
            const me = await meRes.json();
            if (me.user) {
              setUserRole(me.user.role || "");
              setHeaderInfo((prev) => ({
                ...prev,
                name: me.user.display_name || prev.name,
                staffAccount: me.user.login_id || prev.staffAccount,
                staffId: me.user.id ? `SJ${me.user.id.slice(0, 5).toUpperCase()}` : prev.staffId,
                title: ROLES_MAP[me.user.role]?.title || prev.title,
                department: ROLES_MAP[me.user.role]?.dept || prev.department,
              }));
              if (me.session?.expires_at) {
                setSessionExpiry(me.session.expires_at);
              }
            }
          }

          if (coursesRes.ok) {
            const data = await coursesRes.json();
            setCourses(data.items || []);
          }
        } catch {
          // Keep default mock data gracefully
        } finally {
          setLoading(false);
        }
      }
      void loadUserData();
      return () => controller.abort();
    }
  }, []);

  // Close user dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Save changes handler
  const savePersonal = () => {
    setPersonalInfo(editPersonalForm);
    persistState({ personal: editPersonalForm });
    setEditingModal(null);
  };

  const saveEducation = () => {
    setEducationList(editEducationForm);
    persistState({ education: editEducationForm });
    setEditingModal(null);
  };

  const saveAccount = () => {
    setAccountInfo(editAccountForm);
    persistState({ account: editAccountForm });
    setEditingModal(null);
  };

  const saveHeader = () => {
    setHeaderInfo(editHeaderForm);
    persistState({ header: editHeaderForm });
    setEditingModal(null);
  };

  const persistState = (partial: Record<string, unknown>) => {
    try {
      const saved = localStorage.getItem("custom_user_profile");
      const current = saved ? JSON.parse(saved) : {};
      localStorage.setItem("custom_user_profile", JSON.stringify({ ...current, ...partial }));
    } catch {
      // Ignore storage errors
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        await fetch(`${API}/api/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Continue
      }
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/login");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f8f9fa] text-slate-800 dark:bg-[#0c141c] dark:text-slate-100 font-sans">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-white dark:bg-[#121c27] border-r border-slate-200/80 dark:border-slate-800/80 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Brand / Logo */}
        <div className="flex h-20 items-center justify-between px-7">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/vedu-logo.png"
              alt="Vedu Logo"
              className="h-7 w-7 object-contain"
            />
            <span className="text-2xl font-extrabold tracking-tight text-black dark:text-white">
              Vedu
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 px-3 py-4 text-[14px] font-medium text-slate-500 dark:text-slate-400">
          <Link
            href="/"
            className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <LayoutDashboard size={19} className="text-slate-400" />
            <span>Trang chủ</span>
          </Link>

          {/* Active Item: Staffs -> Profile */}
          <div className="relative">
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 h-7 w-1.5 rounded-r-md bg-black dark:bg-white" />
            <button
              onClick={() => setActiveTab(roleFields.tabName)}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-black dark:text-white dark:text-black dark:text-white font-semibold bg-black/5 dark:bg-white/5 dark:bg-black/5 dark:bg-white/5"
            >
              <div className="flex items-center gap-3.5">
                <Users size={19} className="text-black dark:text-white dark:text-black dark:text-white" />
                <span>Hồ sơ cá nhân</span>
              </div>
            </button>
          </div>

          <Link
            href="/library"
            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <FileText size={19} className="text-slate-400" />
              <span>Tài liệu học tập</span>
            </div>
          </Link>

          {/* Conditional Workspace Link */}
          {["lecturer", "reviewer", "admin"].includes(userRole) && (
            <Link
              href={userRole === "reviewer" ? "/hub/review" : "/hub/manage"}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors bg-blue-50/50 dark:bg-blue-900/20"
            >
              <div className="flex items-center gap-3.5">
                <BookOpen size={19} className="text-blue-500 dark:text-blue-400" />
                <span className="font-semibold text-blue-700 dark:text-blue-300">Không gian làm việc</span>
              </div>
            </Link>
          )}

          {(!userRole || userRole === "student") && (
            <>
              <Link
                href="/learning"
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <BookOpen size={19} className="text-slate-400" />
                  <span>Bài tập trắc nghiệm</span>
                </div>
              </Link>

              <Link
                href="/learning/plans"
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <FileText size={19} className="text-slate-400" />
                  <span>Lộ trình học</span>
                </div>
              </Link>
            </>
          )}

          <div className="pt-6 pb-2">
            <div className="h-px w-full bg-slate-100 dark:bg-slate-800" />
          </div>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <Settings size={19} className="text-slate-400" />
            <span>Cài đặt giao diện</span>
          </button>

          <Link
            href="/"
            className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <HelpCircle size={19} className="text-slate-400" />
            <span>Trợ giúp</span>
          </Link>
        </nav>
      </aside>

      {/* RIGHT MAIN VIEW */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* TOP NAVBAR */}
        <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#121c27] px-6 sm:px-10">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              title="Quay lại trang chính"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu size={22} />
            </button>
          </div>

          {/* Right Header: Notification & User Profile dropdown */}
          <div className="flex items-center gap-5 sm:gap-7">
            <button className="relative text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <Bell size={20} />
              <span className="absolute -top-1 -right-0.5 h-2 w-2 rounded-full bg-black dark:bg-white ring-2 ring-white dark:ring-[#121c27]" />
            </button>

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div className="h-9 w-9 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-amber-50">
                  <img
                    src="/profile-avatar.png"
                    alt={headerInfo.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline-block group-hover:text-black dark:text-white transition-colors">
                  {headerInfo.name}
                </span>
                <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl z-50 text-sm">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{headerInfo.name}</p>
                    <p className="text-xs text-slate-400 break-all">{headerInfo.email}</p>
                  </div>
                  <Link
                    href="/"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <ArrowLeft size={16} /> Quay lại Chat / Trợ lý
                  </Link>
                  <button
                    onClick={() => {
                      setTheme(theme === "dark" ? "light" : "dark");
                      setUserDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                    {theme === "dark" ? "Chế độ Sáng" : "Chế độ Tối"}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <LogOut size={16} /> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* INNER CONTENT CONTAINER */}
        <main className="p-6 sm:p-10 space-y-6 max-w-7xl w-full mx-auto">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400 font-medium">
            <Link href="/" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              {roleFields.breadcrumb[0]}
            </Link>
            <span>/</span>
            <span className="hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">{roleFields.breadcrumb[1]}</span>
            <span>/</span>
            <span className="text-black dark:text-white font-medium">{roleFields.breadcrumb[2]}</span>
          </div>

          {/* Sub-navigation Tabs */}
          <div className="bg-slate-100 dark:bg-slate-800/80 dark:bg-slate-800/80 p-1.5 rounded-2xl flex flex-wrap items-center gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-white dark:bg-slate-900 text-black dark:text-white dark:text-black dark:text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* TAB 1: PROFILE (MAIN VIEW MATCHING SCREENSHOT) */}
          {activeTab === roleFields.tabName && (
            <div className="space-y-6">
              {/* Profile Summary Card */}
              <section className="relative rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
                <button
                  onClick={() => {
                    setEditHeaderForm(headerInfo);
                    setEditingModal("header");
                  }}
                  className="absolute top-6 right-6 p-1.5 rounded-lg text-slate-400 hover:text-black dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  title="Chỉnh sửa thông tin cơ bản"
                >
                  <Pencil size={17} />
                </button>

                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pr-8">
                  {/* Left: Avatar & Name */}
                  <div className="flex items-center gap-6">
                    <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full overflow-hidden shrink-0 bg-amber-100 shadow-xs">
                      <img
                        src="/profile-avatar.png"
                        alt={headerInfo.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                        {headerInfo.name}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[14px]">
                        <span className="font-semibold text-black dark:text-white dark:text-black dark:text-white">{headerInfo.title}</span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="text-slate-400 font-normal">{headerInfo.department}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical separator on large screens */}
                  <div className="hidden xl:block h-16 w-px bg-slate-200 dark:bg-slate-800" />

                  {/* Right: Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3.5 text-[13px]">
                    <div className="flex items-center gap-4">
                      <span className="w-28 text-slate-400 font-normal">{roleFields.idLabel}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{headerInfo.staffId}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="w-28 text-slate-400 font-normal">Số điện thoại:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{headerInfo.phone}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="w-28 text-slate-400 font-normal">{roleFields.accountLabel}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{headerInfo.staffAccount}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="w-28 text-slate-400 font-normal">Email:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{headerInfo.email}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Two-Column Grid Below Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* LEFT COLUMN: Personal information Card */}
                <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                  {/* Card Title & Edit Icon */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Thông tin cá nhân</h3>
                    <button
                      onClick={() => {
                        setEditPersonalForm(personalInfo);
                        setEditingModal("personal");
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-black dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      title="Chỉnh sửa thông tin cá nhân"
                    >
                      <Pencil size={17} />
                    </button>
                  </div>

                  {/* 2-column Grid of Personal Information */}
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-6 text-[13px]">
                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Giới tính</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.gender}</span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Ngày sinh</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.dob}</span>
                    </div>

                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Số CCCD/CMND</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.identifyCode}</span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Quê quán</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.hometown}</span>
                    </div>

                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Quốc tịch</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.nationality}</span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Tôn giáo</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.religion}</span>
                    </div>

                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Ngôn ngữ</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.language}</span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Tình trạng hôn nhân</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{personalInfo.maritalStatus}</span>
                    </div>

                    <div className="sm:col-span-2">
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Địa chỉ thường trú</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                        {personalInfo.permanentAddress}
                      </span>
                    </div>

                    <div className="sm:col-span-2">
                      <span className="block text-[12px] text-slate-400 font-normal mb-1">Địa chỉ hiện tại</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                        {personalInfo.currentAddress}
                      </span>
                    </div>
                  </div>
                </section>

                {/* RIGHT COLUMN: Education Information & Account Information */}
                <div className="space-y-6">
                  {/* Card: Thông tin học vấn */}
                  <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Thông tin học vấn</h3>
                      <button
                        onClick={() => {
                          setEditEducationForm(educationList);
                          setEditingModal("education");
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-black dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Chỉnh sửa học vấn"
                      >
                        <Pencil size={17} />
                      </button>
                    </div>

                    <div className="mt-5 space-y-6">
                      {educationList.map((edu, idx) => (
                        <div key={idx}>
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{edu.degree}</span>
                            <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 shrink-0">
                              {edu.period}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] text-slate-400 font-normal">{edu.school}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Card: Thông tin tài khoản */}
                  <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Thông tin tài khoản</h3>
                      <button
                        onClick={() => {
                          setEditAccountForm(accountInfo);
                          setEditingModal("account");
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-black dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Chỉnh sửa tài khoản ngân hàng"
                      >
                        <Pencil size={17} />
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-y-5 gap-x-6 text-[13px]">
                      <div>
                        <span className="block text-[12px] text-slate-400 font-normal mb-1">Số tài khoản</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{accountInfo.bankAccount}</span>
                      </div>
                      <div>
                        <span className="block text-[12px] text-slate-400 font-normal mb-1">Chủ tài khoản</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{accountInfo.accountName}</span>
                      </div>
                      <div>
                        <span className="block text-[12px] text-slate-400 font-normal mb-1">Bank</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{accountInfo.bank}</span>
                      </div>

                      <div>
                        <span className="block text-[12px] text-slate-400 font-normal mb-1">Mã số thuế</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{accountInfo.taxCode}</span>
                      </div>
                      <div>
                        <span className="block text-[12px] text-slate-400 font-normal mb-1">Mã bảo hiểm</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{accountInfo.insuranceCode}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORK INFORMATION (CONNECTED COURSES & PERMISSIONS) */}
          {activeTab === "Thông tin học tập" && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Thông tin công tác & Học liệu</h3>
                <p className="text-sm text-slate-500 mb-6">Danh sách học phần, quyền truy cập tài liệu và phân quyền hệ thống.</p>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-800/40">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-slate-800 dark:text-slate-200">
                      <Building2 size={16} className="text-black dark:text-white" /> Phòng ban & Trực thuộc
                    </h4>
                    <dl className="space-y-3 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Đơn vị:</dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-200">{headerInfo.department}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Chức vụ:</dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-200">{headerInfo.title}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Quản trị tổ chức:</dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-200">Vedu</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-800/40">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-slate-800 dark:text-slate-200">
                      <ShieldCheck size={16} className="text-emerald-500" /> Phiên làm việc & Bảo mật
                    </h4>
                    <dl className="space-y-3 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Tài khoản:</dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-200">{headerInfo.staffAccount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Hết hạn phiên:</dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-200">
                          {sessionExpiry ? new Date(sessionExpiry).toLocaleString("vi-VN") : "Phiên tiêu chuẩn (30 ngày)"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Bảo mật 2 lớp:</dt>
                        <dd className="font-semibold text-emerald-600">Đã kích hoạt</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="mt-8">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-200">
                    <BookOpen size={16} className="text-black dark:text-white" /> Môn học & Học phần được phân công ({courses.length})
                  </h4>
                  {courses.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {courses.map((c) => (
                        <div key={c.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{c.name}</p>
                          <p className="text-xs text-slate-400 mt-1">{c.code || c.id}{c.term ? ` · Kỳ ${c.term}` : ""}</p>
                          <div className="mt-3 flex gap-2 text-[11px] text-black dark:text-white dark:text-black dark:text-white">
                            <span className="bg-black/5 dark:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">Đọc tài liệu</span>
                            {c.can_upload && <span className="bg-black/5 dark:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">Đăng tải</span>}
                            {c.can_review && <span className="bg-black/5 dark:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">Kiểm duyệt</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
                      Chưa có môn học liên kết hoặc đang trong chế độ hồ sơ nhân sự chuẩn.
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: TIMESHEET & ATTENDANCE */}
          {activeTab === "Timesheet & Attendance" && (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Bảng chấm công & Điểm danh</h3>
              <p className="text-xs text-slate-400">Dữ liệu chấm công tháng 03/2025.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">Ngày</th>
                      <th className="p-3">Giờ vào</th>
                      <th className="p-3">Giờ ra</th>
                      <th className="p-3">Tổng giờ</th>
                      <th className="p-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    <tr>
                      <td className="p-3">Hôm nay (28/03)</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">08:28</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">17:35</td>
                      <td className="p-3">8.5h</td>
                      <td className="p-3 text-emerald-600">Đúng giờ</td>
                    </tr>
                    <tr>
                      <td className="p-3">27/03/2025</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">08:30</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">18:00</td>
                      <td className="p-3">8.5h</td>
                      <td className="p-3 text-emerald-600">Đúng giờ</td>
                    </tr>
                    <tr>
                      <td className="p-3">26/03/2025</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">08:25</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">17:45</td>
                      <td className="p-3">8.2h</td>
                      <td className="p-3 text-emerald-600">Đúng giờ</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CONTRACTS & DOCUMENTS */}
          {activeTab === "Contracts & Documents" && (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Hợp đồng & Tài liệu pháp lý</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <FileText className="text-black dark:text-white" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Hợp đồng lao động chính thức</p>
                      <p className="text-xs text-slate-400">Hiệu lực từ 01/01/2024 · Đã ký kết số</p>
                    </div>
                  </div>
                  <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full">Đang hiệu lực</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <FileText className="text-black dark:text-white" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Thoả thuận bảo mật thông tin (NDA)</p>
                      <p className="text-xs text-slate-400">Ký ngày 15/12/2023</p>
                    </div>
                  </div>
                  <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full">Đã xác nhận</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PAYROLL & BENEFITS */}
          {activeTab === "Payroll & Benefits" && (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Lương & Chế độ đãi ngộ</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-400">Bậc lương hiện tại</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">Level 4 - Senior</p>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-400">Bảo hiểm xã hội & Y tế</p>
                  <p className="text-lg font-bold text-emerald-600 mt-1">Đầy đủ 100%</p>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-400">Ngày phép còn lại</p>
                  <p className="text-lg font-bold text-black dark:text-white mt-1">11.5 ngày</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: COMPANY ASSETS */}
          {activeTab === "Company assets" && (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Tài sản & Thiết bị bàn giao</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <Laptop className="text-black dark:text-white" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Apple MacBook Pro 16" M3 Pro</p>
                      <p className="text-xs text-slate-400">Số serial: C02GM932MD6R · Bàn giao ngày 10/01/2024</p>
                    </div>
                  </div>
                  <span className="text-xs text-black dark:text-white font-semibold bg-black/5 dark:bg-white/5 dark:bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full">Đang sử dụng</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* EDIT MODALS                                               */}
      {/* ========================================================= */}

      {/* 1. Edit Personal Information Modal */}
      {editingModal === "personal" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Chỉnh sửa Thông tin cá nhân</h3>
              <button onClick={() => setEditingModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Giới tính</label>
                <input
                  type="text"
                  value={editPersonalForm.gender}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, gender: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Ngày sinh</label>
                <input
                  type="text"
                  value={editPersonalForm.dob}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, dob: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Số CCCD/CMND</label>
                <input
                  type="text"
                  value={editPersonalForm.identifyCode}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, identifyCode: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Quê quán</label>
                <input
                  type="text"
                  value={editPersonalForm.hometown}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, hometown: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Quốc tịch</label>
                <input
                  type="text"
                  value={editPersonalForm.nationality}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, nationality: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Tôn giáo</label>
                <input
                  type="text"
                  value={editPersonalForm.religion}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, religion: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Ngôn ngữ</label>
                <input
                  type="text"
                  value={editPersonalForm.language}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, language: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Tình trạng hôn nhân</label>
                <input
                  type="text"
                  value={editPersonalForm.maritalStatus}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, maritalStatus: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-slate-500 font-medium mb-1">Địa chỉ thường trú</label>
                <input
                  type="text"
                  value={editPersonalForm.permanentAddress}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, permanentAddress: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-slate-500 font-medium mb-1">Địa chỉ hiện tại</label>
                <input
                  type="text"
                  value={editPersonalForm.currentAddress}
                  onChange={(e) => setEditPersonalForm({ ...editPersonalForm, currentAddress: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Huỷ bỏ
              </button>
              <button
                onClick={savePersonal}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-black dark:bg-white dark:text-black hover:bg-black/5 dark:bg-white/5"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Edit Education Modal */}
      {editingModal === "education" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Chỉnh sửa Thông tin học vấn</h3>
              <button onClick={() => setEditingModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {editEducationForm.map((edu, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Bằng cấp / Chứng chỉ #{idx + 1}</span>
                  </div>
                  <input
                    type="text"
                    value={edu.degree}
                    placeholder="Tên văn bằng"
                    onChange={(e) => {
                      const updated = [...editEducationForm];
                      updated[idx].degree = e.target.value;
                      setEditEducationForm(updated);
                    }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={edu.school}
                      placeholder="Trường đào tạo"
                      onChange={(e) => {
                        const updated = [...editEducationForm];
                        updated[idx].school = e.target.value;
                        setEditEducationForm(updated);
                      }}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                    />
                    <input
                      type="text"
                      value={edu.period}
                      placeholder="Thời gian (ví dụ: 2014-2018)"
                      onChange={(e) => {
                        const updated = [...editEducationForm];
                        updated[idx].period = e.target.value;
                        setEditEducationForm(updated);
                      }}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Huỷ bỏ
              </button>
              <button
                onClick={saveEducation}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-black dark:bg-white dark:text-black hover:bg-black/5 dark:bg-white/5"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Edit Account Information Modal */}
      {editingModal === "account" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Chỉnh sửa Thông tin tài khoản</h3>
              <button onClick={() => setEditingModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Số tài khoản</label>
                <input
                  type="text"
                  value={editAccountForm.bankAccount}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, bankAccount: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Chủ tài khoản</label>
                <input
                  type="text"
                  value={editAccountForm.accountName}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, accountName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Bank</label>
                <input
                  type="text"
                  value={editAccountForm.bank}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, bank: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Mã số thuế</label>
                  <input
                    type="text"
                    value={editAccountForm.taxCode}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, taxCode: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Mã bảo hiểm</label>
                  <input
                    type="text"
                    value={editAccountForm.insuranceCode}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, insuranceCode: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Huỷ bỏ
              </button>
              <button
                onClick={saveAccount}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-black dark:bg-white dark:text-black hover:bg-black/5 dark:bg-white/5"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Edit Header Card Information Modal */}
      {editingModal === "header" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Chỉnh sửa hồ sơ cơ bản</h3>
              <button onClick={() => setEditingModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Họ và tên</label>
                <input
                  type="text"
                  value={editHeaderForm.name}
                  onChange={(e) => setEditHeaderForm({ ...editHeaderForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Chức danh</label>
                  <input
                    type="text"
                    value={editHeaderForm.title}
                    onChange={(e) => setEditHeaderForm({ ...editHeaderForm, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Phòng ban</label>
                  <input
                    type="text"
                    value={editHeaderForm.department}
                    onChange={(e) => setEditHeaderForm({ ...editHeaderForm, department: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Mã định danh</label>
                  <input
                    type="text"
                    value={editHeaderForm.staffId}
                    onChange={(e) => setEditHeaderForm({ ...editHeaderForm, staffId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Tài khoản</label>
                  <input
                    type="text"
                    value={editHeaderForm.staffAccount}
                    onChange={(e) => setEditHeaderForm({ ...editHeaderForm, staffAccount: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={editHeaderForm.phone}
                    onChange={(e) => setEditHeaderForm({ ...editHeaderForm, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Email</label>
                  <input
                    type="text"
                    value={editHeaderForm.email}
                    onChange={(e) => setEditHeaderForm({ ...editHeaderForm, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-black dark:focus:outline-white"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Huỷ bỏ
              </button>
              <button
                onClick={saveHeader}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-black dark:bg-white dark:text-black hover:bg-black/5 dark:bg-white/5"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
