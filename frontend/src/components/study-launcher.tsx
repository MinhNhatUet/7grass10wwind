"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, GraduationCap, Home, LibraryBig, MessageSquare, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, json, newRequestId, type ChatMessage, type Conversation } from "@/lib/api";
import { errorMessage } from "@/lib/messages";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export default function StudyLauncher({ action }: { action: "quiz" | "plan" }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { profile, courses, signOut, handleAuthError, error: sessionError, reload } = useSession();
  const [course, setCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [days, setDays] = useState(7);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultConversation, setResultConversation] = useState("");
  const [history, setHistory] = useState<Conversation[]>([]);
  const pending = useRef<{ fingerprint: string; key: string; convId?: string } | null>(null);
  const isPlan = action === "plan";
  const selectedCourse = course || courses?.[0]?.id || "";

  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    api<{ items: Conversation[] }>("/conversations?limit=50", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setHistory(data.items.filter(c => c.assistant_mode === "learning")); })
      .catch(e => { if (!controller.signal.aborted && !handleAuthError(e)) setError(e instanceof ApiError ? errorMessage(e.code) : "Không tải được lịch sử học tập."); });
    return () => controller.abort();
  }, [profile, handleAuthError]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy || !selectedCourse || !topic.trim()) return;
    setBusy(true); setError(""); setNotice(""); setResultConversation("");
    const learning = isPlan ? { action, goal: topic.trim(), days, minutes_per_day: minutes } : { action, topic: topic.trim() };
    const fingerprint = JSON.stringify({ course: selectedCourse, learning });
    if (!pending.current || pending.current.fingerprint !== fingerprint) pending.current = { fingerprint, key: newRequestId() };
    const request = pending.current;
    try {
      if (!request.convId) {
        const conv = await api<{ conversation_id: string }>("/conversations", { method: "POST", body: json({ course_id: selectedCourse, assistant: "learning", title: `${isPlan ? "Lộ trình" : "Tự kiểm tra"}: ${topic.trim()}` }) });
        request.convId = conv.conversation_id;
      }
      const result = await api<ChatMessage>(`/conversations/${request.convId}/messages`, { method: "POST", idempotencyKey: request.key, body: json({ content: `${isPlan ? "Lập lộ trình học" : "Tạo bài tự kiểm tra"}: ${topic.trim()}`, assistant: "learning", learning }) });
      setResultConversation(request.convId);
      pending.current = null;
      if ((isPlan && result.metadata.plan) || (!isPlan && result.metadata.questions?.length)) {
        router.push(`/chat?conv=${encodeURIComponent(request.convId)}`);
      } else {
        setNotice(result.content || "Chưa đủ nguồn để tạo nội dung học tập.");
      }
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? errorMessage(e.code) : "Không thể tạo nội dung lúc này. Hãy thử lại.");
    } finally { setBusy(false); }
  }

  return (
    <main className="library-page min-h-screen bg-[#f8f9fa] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-white/10 dark:bg-[#151619] lg:flex">
          <Link href="/chat" className="flex h-20 items-center gap-3 border-b border-slate-100 dark:border-white/5 px-7 text-2xl font-extrabold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900"><BookOpen size={21} /></span>Vedu</Link>
          <nav aria-label="Điều hướng chính" className="space-y-2 p-4 text-sm font-medium">
            <Link href="/chat" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"><MessageSquare size={19} />Chat AI</Link>
            <Link href="/profile" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"><UserRound size={19} />Hồ sơ</Link>
            <div className="my-4 border-t border-slate-100 dark:border-white/5" />
            <p className="px-4 pb-2 text-[11px] font-semibold tracking-widest text-slate-400">KHÔNG GIAN HỌC TẬP</p>
            <Link href="/library" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"><LibraryBig size={19} />Tài liệu học tập</Link>
            <Link href="/learning" aria-current={!isPlan ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${!isPlan ? "bg-slate-100 dark:bg-white/10 font-semibold text-slate-900 dark:text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"}`}><CheckCircle2 size={19} />Bài tự kiểm tra</Link>
            <Link href="/learning/plans" aria-current={isPlan ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${isPlan ? "bg-slate-100 dark:bg-white/10 font-semibold text-slate-900 dark:text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"}`}><GraduationCap size={20} />Lộ trình học tập</Link>
          </nav>
          <div className="mx-5 mb-6 mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <ShieldCheck size={22} className="mb-3 text-emerald-600" /><p className="text-sm font-semibold">Nguồn học liệu tin cậy</p><p className="mt-2 text-xs leading-5 text-slate-500">Chỉ hiển thị tài liệu đã phát hành và được cấp quyền truy cập.</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8">
            <div className="flex items-center gap-3 text-sm"><Link href="/chat" aria-label="Trang chủ" className="text-slate-500 hover:text-slate-900 dark:hover:text-white"><Home size={18} /></Link><ChevronRight size={15} className="text-slate-300" /><span className="font-semibold">{isPlan ? "Lộ trình học tập" : "Bài tự kiểm tra"}</span></div>
            <div className="flex shrink-0 items-center gap-3 sm:gap-4">
              <Link href="/chat" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-black dark:text-slate-400 dark:hover:text-white"><ArrowLeft size={16} /><span className="hidden sm:inline">Về Chat AI</span></Link>
              <button type="button" aria-label="Chuyển giao diện sáng/tối" title="Chuyển giao diện sáng/tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
                <Moon size={18} className="dark:hidden" aria-hidden="true" />
                <Sun size={18} className="hidden dark:block" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-8">
            <div className="legacy-ui">
              <div className="container wide study-launcher" style={{ padding: "0" }}>
                <p className="muted small">KHÔNG GIAN HỌC TẬP</p>
                <h1 style={{ marginTop: "10px" }}>{isPlan ? "Lộ trình học tập" : "Bài tự kiểm tra"}</h1>
                <p className="muted">{isPlan ? "Lập kế hoạch từ tài liệu được phép đọc, xác nhận và theo dõi từng buổi học." : "Tạo câu hỏi theo môn học, lưu câu trả lời và nhận đánh giá mức hiểu từ AI."}</p>
                <nav className="chips" aria-label="Công cụ học tập"><Link className={`chip${!isPlan ? " active" : ""}`} href="/learning">Tự kiểm tra</Link><Link className={`chip${isPlan ? " active" : ""}`} href="/learning/plans">Lộ trình</Link></nav>
                {sessionError && <div role="alert" className="banner banner-error">Không thể tải phiên đăng nhập. <button onClick={() => void reload()}>Thử lại</button></div>}
                {error && <div role="alert" className="banner banner-error">{error}</div>}
                {notice && <div role="status" className="banner banner-info">{notice} {resultConversation && <Link href={`/chat?conv=${encodeURIComponent(resultConversation)}`}>Mở hội thoại</Link>}</div>}
                {courses === null ? <p role="status">Đang tải quyền truy cập…</p> : !courses.length ? <div className="card"><h2>Chưa có môn học được cấp quyền</h2><p className="muted">Liên hệ giảng viên hoặc quản trị viên để được cấp quyền đọc học liệu.</p><Link href="/library">Về thư viện</Link></div> : <form className="card" onSubmit={create}>
                  <fieldset disabled={busy} className="form-grid">
                    <label>Môn học<select required value={selectedCourse} onChange={e => setCourse(e.target.value)}>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label>{isPlan ? "Mục tiêu học tập" : "Chủ đề tự kiểm tra"}<textarea required maxLength={1000} rows={3} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ví dụ: Đồ thị và đường đi Euler" /></label>
                    {isPlan && <><label>Số ngày<input type="number" required min={1} max={60} value={days} onChange={e => setDays(Number(e.target.value))} /></label><label>Thời lượng mỗi ngày (phút)<input type="number" required min={1} max={600} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label></>}
                    <div className="row"><button type="submit" disabled={!topic.trim() || busy}>{busy ? "Đang tạo từ học liệu…" : isPlan ? "Tạo lộ trình" : "Tạo bài tự kiểm tra"}</button><Link href="/library">Xem tài liệu nguồn</Link></div>
                  </fieldset>
                  <p className="muted small">{isPlan ? "Kế hoạch mới là bản nháp. Chỉ bắt đầu theo dõi sau khi bạn xác nhận trong hội thoại." : "Đây là câu hỏi tự kiểm tra dạng trả lời ngắn, không phải bài thi tính điểm. Câu hỏi và đánh giá chỉ dựa trên nguồn được cấp quyền."}</p>
                </form>}
                <section className="card"><h2>Hội thoại học tập gần đây</h2><p className="muted small">Các hội thoại với trợ lý học tập trong 50 hội thoại gần nhất. Mở để tiếp tục bài đã lưu hoặc cập nhật tiến độ.</p>{history.length ? <ul className="study-history">{history.map(c => <li key={c.id}><Link href={`/chat?conv=${encodeURIComponent(c.id)}`}>{c.title}</Link><span className="muted small">{new Date(c.updated_at).toLocaleDateString("vi-VN")}</span></li>)}</ul> : <p className="muted">Chưa có hội thoại học tập gần đây.</p>}</section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
