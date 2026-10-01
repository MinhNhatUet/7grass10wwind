"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, json, newRequestId, type ChatMessage, type Conversation } from "@/lib/api";
import { errorMessage } from "@/lib/messages";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export default function StudyLauncher({ action }: { action: "quiz" | "plan" }) {
  const router = useRouter();
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

  return <AppShell profile={profile} courses={courses} onSignOut={signOut}>
    <main className="container wide study-launcher">
      <p className="muted small">KHÔNG GIAN HỌC TẬP</p>
      <h1>{isPlan ? "Lộ trình học tập" : "Bài tự kiểm tra"}</h1>
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
    </main>
  </AppShell>;
}
