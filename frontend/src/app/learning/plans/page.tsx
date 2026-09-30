"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  BookOpen, Calendar, Clock, Plus, Target, CheckCircle2, 
  ChevronRight, Compass, Settings, Play, ArrowLeft, Loader2,
  Home, Search, Bell, Lightbulb, ListTodo, TrendingUp,
  Rocket, Sparkles, Check
} from "lucide-react";
import { API, authHeaders } from "@/lib/api-errors";

export default function LearningPlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState<any>(null);
  
  // Create Plan Form
  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [days, setDays] = useState(5);
  const [minutes, setMinutes] = useState(30);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load courses
        const coursesRes = await fetch(`${API}/me/courses`, { headers: authHeaders() });
        if (coursesRes.ok) {
          const cData = await coursesRes.json();
          setCourses(cData.items || []);
          if (cData.items && cData.items.length > 0) {
            setSelectedCourseId(cData.items[0].id);
          }
        }

        // Load stored plans
        const stored = localStorage.getItem("learning_plans");
        if (stored) {
          const planIds = JSON.parse(stored);
          const loadedPlans = [];
          for (const id of planIds) {
            const res = await fetch(`${API}/learning/plans/${id}`, { headers: authHeaders() });
            if (res.ok) {
              loadedPlans.push(await res.json());
            }
          }
          setPlans(loadedPlans);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const savePlanId = (id: string) => {
    const stored = localStorage.getItem("learning_plans");
    const planIds = stored ? JSON.parse(stored) : [];
    if (!planIds.includes(id)) {
      planIds.push(id);
      localStorage.setItem("learning_plans", JSON.stringify(planIds));
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    setIsCreating(true);
    try {
      const convRes = await fetch(`${API}/conversations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ 
          assistant: "learning", 
          title: `Lộ trình: ${goal}`,
          course_id: selectedCourseId || undefined
        })
      });
      if (!convRes.ok) throw new Error("Could not create conversation");
      const conv = await convRes.json();
      
      const msgRes = await fetch(`${API}/conversations/${conv.conversation_id || conv.id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          content: `Tạo lộ trình học: ${goal} trong ${days} ngày, mỗi ngày ${minutes} phút.`,
          assistant: "learning",
          learning: {
            action: "plan",
            goal: goal,
            days: parseInt(String(days)),
            minutes_per_day: parseInt(String(minutes))
          }
        })
      });
      if (!msgRes.ok) throw new Error("Could not generate plan");
      const msg = await msgRes.json();
      
      if (msg.payload && msg.payload.plan) {
        const newPlan = msg.payload.plan;
        savePlanId(newPlan.id);
        setPlans(prev => [...prev, newPlan]);
        setActivePlan(newPlan);
        setShowForm(false);
        setGoal("");
      } else {
        alert("AI không thể tạo lộ trình lúc này.");
      }
    } catch (e) {
      console.error(e);
      alert("Đã xảy ra lỗi khi tạo lộ trình.");
    } finally {
      setIsCreating(false);
    }
  };

  const updateSessionStatus = async (planId: string, sessionId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API}/learning/plans/${planId}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const updated = await res.json();
        setPlans(prev => prev.map(p => p.id === planId ? updated : p));
        if (activePlan?.id === planId) setActivePlan(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-sans">
      {/* TOP NAVIGATION BAR */}
      <header className="h-[64px] bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
        <div className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
          <Link href="/" className="hover:text-black transition-colors text-black">
            <Home size={18} />
          </Link>
          <span className="text-slate-300">/</span>
          <Link href="/profile" className="hover:text-black transition-colors text-slate-500">
            Hồ sơ
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-black font-medium">Lộ trình học tập</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm lộ trình, kỹ năng..." 
              className="h-[40px] w-[300px] border border-slate-200 rounded-full pl-10 pr-14 text-[13px] outline-none focus:border-blue-500 bg-[#f8f9fa] focus:bg-white transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              <span className="text-[11px] font-medium text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">Ctrl K</span>
            </div>
          </div>
          
          <button className="relative w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <Bell size={18} />
            <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500 border border-white"></span>
          </button>
          
          <button className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm shadow-md">
            B
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 md:p-8">
        {/* PAGE HEADER */}
        <div className="flex items-center gap-5 mb-8">
          <Link href="/" className="w-12 h-12 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-100 text-black hover:bg-slate-50 transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Lộ trình học tập (Learning Plans)</h1>
            <p className="text-slate-500 text-[15px] mt-1.5">Xây dựng và theo dõi lộ trình học tập cá nhân hóa bằng AI</p>
          </div>
        </div>

        {showForm ? (
          /* CREATE PLAN FORM */
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 max-w-2xl mx-auto animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
              <Target className="text-black" /> Tạo lộ trình mới
            </h2>
            <form onSubmit={handleCreatePlan} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Chọn môn học</label>
                <div className="relative">
                  <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select
                    value={selectedCourseId}
                    onChange={e => setSelectedCourseId(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-black/10 focus:border-black outline-none text-[15px] appearance-none bg-white"
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {courses.length === 0 && <option value="">Đang tải môn học...</option>}
                  </select>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" size={18} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nội dung muốn học</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="Vd: Chương 1, Các thuật toán sắp xếp..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-black/10 focus:border-black outline-none transition-all text-[15px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Thời gian (Số ngày)</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="number" 
                      min={1} max={30}
                      value={days}
                      onChange={e => setDays(parseInt(e.target.value) || 1)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-black/10 focus:border-black outline-none text-[15px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Thời lượng (Phút/ngày)</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="number" 
                      min={10} max={300} step={10}
                      value={minutes}
                      onChange={e => setMinutes(parseInt(e.target.value) || 10)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-black/10 focus:border-black outline-none text-[15px]"
                    />
                  </div>
                </div>
              </div>
              <div className="pt-6 flex items-center justify-end gap-3 border-t border-slate-100 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  disabled={isCreating}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium bg-black text-white hover:bg-black/80 disabled:opacity-70 transition-colors shadow-sm"
                >
                  {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  Tạo lộ trình bằng AI
                </button>
              </div>
            </form>
          </div>
        ) : activePlan ? (
          /* VIEW ACTIVE PLAN */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 animate-in fade-in">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="p-8 border-b border-slate-100 bg-white">
                <button 
                  onClick={() => setActivePlan(null)}
                  className="text-[13px] text-[#1b64f2] font-semibold hover:underline mb-5 inline-flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full"
                >
                  <ArrowLeft size={14} /> Quay lại danh sách
                </button>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">{activePlan.goal}</h2>
                    <div className="flex flex-wrap gap-4 mt-4 text-[14px] text-slate-600">
                      <span className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"><Calendar size={16} className="text-blue-500"/> {activePlan.days} ngày</span>
                      <span className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"><Clock size={16} className="text-amber-500"/> {activePlan.minutes_per_day} phút/ngày</span>
                      <span className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"><Target size={16} className="text-emerald-500"/> <span className="font-semibold text-slate-800">{activePlan.status}</span></span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50">
                {activePlan.sessions?.map((session: any, i: number) => (
                  <div key={session.id} className={`p-6 rounded-2xl border-2 transition-all ${session.status === 'Completed' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                    <div className="flex items-start justify-between gap-5">
                      <div className="flex gap-5">
                        <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-bold text-lg ${session.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-[#1b64f2]'}`}>
                          {i + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-[16px] text-slate-900">{session.topic || `Phiên học ngày ${i + 1}`}</h3>
                          <p className="text-[14px] text-slate-600 mt-1.5 leading-relaxed">{session.objective}</p>
                          {session.topics && session.topics.length > 0 && (
                            <ul className="mt-4 space-y-2 text-[14px] text-slate-600 list-disc pl-5 marker:text-slate-300">
                              {session.topics.map((t: string, j: number) => (
                                <li key={j}>{t}</li>
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center gap-3 mt-5 text-[13px] font-medium">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md flex items-center gap-1.5"><Clock size={14}/> {session.duration_minutes} phút</span>
                            {session.status === 'Completed' && <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-md flex items-center gap-1.5"><CheckCircle2 size={14}/> Đã hoàn thành</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        {session.status !== 'Completed' ? (
                          <button 
                            onClick={() => updateSessionStatus(activePlan.id, session.id, 'Completed')}
                            className="text-[13px] font-semibold px-5 py-2.5 rounded-xl bg-blue-50 text-[#1b64f2] hover:bg-blue-100 transition-colors whitespace-nowrap"
                          >
                            Đánh dấu hoàn thành
                          </button>
                        ) : (
                          <button 
                            onClick={() => updateSessionStatus(activePlan.id, session.id, 'Pending')}
                            className="text-[13px] font-medium px-5 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            Hủy hoàn thành
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
                <h3 className="font-bold text-[16px] mb-5 text-slate-800">Tiến độ lộ trình</h3>
                <div className="w-full bg-slate-100 rounded-full h-3.5 mb-3 overflow-hidden">
                  <div 
                    className="bg-[#1b64f2] h-full rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${(activePlan.sessions.filter((s:any)=>s.status==='Completed').length / activePlan.sessions.length) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[14px] font-medium text-slate-600">
                  <span>Đã học {activePlan.sessions.filter((s:any)=>s.status==='Completed').length} / {activePlan.sessions.length} phiên</span>
                  <span className="text-[#1b64f2] font-bold">{Math.round((activePlan.sessions.filter((s:any)=>s.status==='Completed').length / activePlan.sessions.length) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* MAIN LAYOUT (MATCHING IMAGE) */
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
            
            {/* LEFT COLUMN: Guide */}
            <div className="space-y-6">
              <button 
                onClick={() => setShowForm(true)}
                className="w-full py-3.5 rounded-xl bg-black text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-black/80 shadow-md transition-all"
              >
                <Plus size={18} /> Tạo lộ trình mới
              </button>
              
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center gap-3 text-slate-800 font-bold text-[16px] mb-4">
                  <Lightbulb className="text-black" size={20} />
                  Hướng dẫn
                </div>
                <p className="text-[14px] text-slate-600 leading-relaxed mb-6">
                  Lộ trình học tập cá nhân hóa được tạo bởi trợ lý AI dựa trên mục tiêu, kỹ năng và thời gian của bạn. Chọn <strong>Tạo lộ trình mới</strong> để bắt đầu lên kế hoạch cho môn học hoặc chứng chỉ bạn mong muốn.
                </p>

                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                      <Target size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[14px] text-slate-800">Đặt mục tiêu</h4>
                      <p className="text-[13px] text-slate-500 mt-0.5">Chọn kỹ năng, chứng chỉ hoặc vị trí mong muốn.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                      <ListTodo size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[14px] text-slate-800">AI xây dựng lộ trình</h4>
                      <p className="text-[13px] text-slate-500 mt-0.5">Tự động tạo kế hoạch học tập chi tiết.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[14px] text-slate-800">Theo dõi tiến độ</h4>
                      <p className="text-[13px] text-slate-500 mt-0.5">Cập nhật và theo dõi quá trình học.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                      <TrendingUp size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[14px] text-slate-800">Đạt mục tiêu</h4>
                      <p className="text-[13px] text-slate-500 mt-0.5">Nhận gợi ý và điều chỉnh từ AI.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* RIGHT COLUMN: Plans List or Empty State */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-[500px]">
              <div className="p-6 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between">
                <h2 className="font-bold text-[18px] text-slate-800">Lộ trình của bạn ({plans.length})</h2>
                
                <div className="flex gap-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm lộ trình..." 
                      className="h-[36px] w-[200px] border border-slate-200 rounded-lg pl-9 pr-3 text-[13px] outline-none focus:border-blue-500"
                    />
                  </div>
                  <select className="h-[36px] border border-slate-200 rounded-lg px-3 text-[13px] text-slate-600 outline-none focus:border-blue-500 bg-white">
                    <option>Tất cả trạng thái</option>
                    <option>Đang học</option>
                    <option>Hoàn thành</option>
                  </select>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col">
                {loading ? (
                  <div className="flex-1 flex justify-center items-center"><Loader2 size={32} className="animate-spin text-slate-300" /></div>
                ) : plans.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                    <div className="w-32 h-32 mb-6 relative">
                      <BookOpen size={100} className="text-blue-100" />
                      <Rocket size={40} className="text-[#1b64f2] absolute -top-2 -right-2" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Bạn chưa có lộ trình học tập nào.</h3>
                    <p className="text-[15px] text-slate-500 max-w-sm mb-8">
                      Hãy tạo một lộ trình để AI sắp xếp kế hoạch học tập phù hợp với mục tiêu và thời gian của bạn.
                    </p>
                    <button 
                      onClick={() => setShowForm(true)}
                      className="px-6 py-3 rounded-xl bg-black text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-black/80 shadow-md transition-all mb-12"
                    >
                      <Plus size={18} /> Tạo lộ trình mới
                    </button>
                    
                    <div className="flex gap-4 flex-wrap justify-center">
                      <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-[13px] font-medium border border-slate-200">
                        <CheckCircle2 size={16} /> Cá nhân hoá bằng AI
                      </span>
                      <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-[13px] font-medium border border-slate-200">
                        <CheckCircle2 size={16} /> Kế hoạch chi tiết
                      </span>
                      <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-[13px] font-medium border border-slate-200">
                        <CheckCircle2 size={16} /> Theo dõi tiến độ dễ dàng
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 grid gap-4">
                    {plans.map(plan => {
                      const completed = plan.sessions?.filter((s:any) => s.status === 'Completed').length || 0;
                      const total = plan.sessions?.length || 1;
                      const progress = Math.round((completed / total) * 100);
                      
                      return (
                        <div 
                          key={plan.id}
                          onClick={() => setActivePlan(plan)}
                          className="p-5 rounded-2xl border border-slate-200 hover:border-black hover:shadow-md cursor-pointer transition-all flex items-center justify-between group bg-white"
                        >
                          <div>
                            <h3 className="font-bold text-slate-800 text-[16px] transition-colors">{plan.goal}</h3>
                            <div className="flex items-center gap-4 text-[13px] text-slate-500 mt-2">
                              <span className="flex items-center gap-1.5"><Calendar size={14}/> {plan.days} ngày</span>
                              <span className="flex items-center gap-1.5"><Clock size={14}/> {plan.minutes_per_day} phút/ngày</span>
                              <span className={`px-2.5 py-1 rounded-md text-[12px] font-semibold bg-slate-100 text-slate-600`}>
                                {plan.status}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                              <div className="flex items-center gap-3">
                                <div className="w-24 bg-slate-100 rounded-full h-2">
                                  <div className="bg-black h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                                </div>
                                <span className="text-[14px] font-bold text-slate-700 w-9">{progress}%</span>
                              </div>
                              <div className="text-[12px] text-slate-400 mt-1">Đã học {completed}/{total} phiên</div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 transition-colors text-slate-400 group-hover:text-black">
                              <ChevronRight size={20} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
