"use client";
import React, { useEffect, useState } from "react";
import { API } from "@/lib/api-errors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, BookOpen, Clock, FileText, CheckCircle2, MessageSquare, ArrowRight, Save } from "lucide-react";

type Overview = {
  usage: { total_queries: number; latency_p95_ms?: number | null };
  review_queue: number;
  source_gaps?: { insufficient_evidence: number };
};
type Feedback = {
  id: string; status: string; type: string; created_at: string;
  note?: string | null; resolution_note?: string | null; shared?: { question?: string } | null;
};

export default function LecturerDashboard({ courseId }: { courseId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<{ actor: string; action: string; object_type: string; object_id: string; created_at: string }[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveStatus, setResolveStatus] = useState("Resolved");

  useEffect(() => {
    if (!courseId) return;
    const loadData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const [ovRes, histRes, fbRes] = await Promise.all([
          fetch(`${API}/dashboard/overview?course_id=${courseId}&days=7`, { headers }),
          fetch(`${API}/dashboard/history?course_id=${courseId}&limit=50`, { headers }),
          fetch(`${API}/dashboard/feedback?course_id=${courseId}`, { headers }),
        ]);

        if (ovRes.ok) setOverview(await ovRes.json());
        if (histRes.ok) setHistory((await histRes.json()).items);
        if (fbRes.ok) setFeedbacks((await fbRes.json()).items);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [courseId]);

  const handleResolve = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/dashboard/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: resolveStatus, resolution_note: resolveNote })
      });
      if (res.ok) {
        setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status: resolveStatus, resolution_note: resolveNote } : f));
        setResolvingId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu dashboard...</div>;
  if (!overview) return <div className="p-8 text-center text-gray-500">Không thể tải dữ liệu.</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Truy vấn AI (7 ngày)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.usage.total_queries}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Tài liệu chờ duyệt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{overview.review_queue}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Nguồn dữ liệu thiếu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overview.source_gaps?.insufficient_evidence || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-medium">Độ trễ AI (p95)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.usage.latency_p95_ms || 0}ms</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm h-[500px] flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><MessageSquare size={18}/> Quản lý Phản hồi (Feedback)</CardTitle>
            <CardDescription>Các đánh giá, báo cáo lỗi từ Sinh viên.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pr-2 space-y-4">
            {feedbacks.length === 0 && <p className="text-sm text-gray-500">Chưa có phản hồi nào.</p>}
            {feedbacks.map(fb => (
              <div key={fb.id} className={`border rounded-lg p-4 ${fb.status === 'Resolved' ? 'bg-gray-50' : 'bg-white border-blue-100 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={fb.status === 'Resolved' ? "outline" : "default"} className={fb.status !== 'Resolved' ? 'bg-blue-100 text-blue-700' : ''}>
                    {fb.status}
                  </Badge>
                  <span className="text-xs text-gray-400">{new Date(fb.created_at).toLocaleString()}</span>
                </div>
                <div className="text-sm font-medium mb-1">Loại: <span className="text-gray-600">{fb.type}</span></div>
                {fb.note && <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded mb-2">“{fb.note}”</div>}
                
                {fb.shared && fb.shared.question && (
                  <div className="text-xs border-l-2 border-gray-200 pl-2 mt-2 mb-3">
                    <p className="font-semibold text-gray-600">Câu hỏi:</p>
                    <p className="text-gray-500 line-clamp-2">{fb.shared.question}</p>
                  </div>
                )}

                {resolvingId === fb.id ? (
                  <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <select 
                      className="w-full text-sm p-2 mb-2 rounded border border-gray-200"
                      value={resolveStatus}
                      onChange={e => setResolveStatus(e.target.value)}
                    >
                      <option value="InProgress">Đang xử lý</option>
                      <option value="Resolved">Đã giải quyết</option>
                    </select>
                    <textarea 
                      className="w-full text-sm p-2 rounded border border-gray-200 mb-2" 
                      placeholder="Ghi chú xử lý..."
                      value={resolveNote}
                      onChange={e => setResolveNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleResolve(fb.id)} className="bg-blue-600">Lưu</Button>
                      <Button size="sm" variant="outline" onClick={() => setResolvingId(null)}>Hủy</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    {fb.resolution_note && (
                      <p className="text-xs text-green-700 bg-green-50 p-2 rounded mb-2">
                        <span className="font-semibold">Phản hồi:</span> {fb.resolution_note}
                      </p>
                    )}
                    {fb.status !== 'Resolved' && (
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { setResolvingId(fb.id); setResolveStatus(fb.status === 'Open' ? 'InProgress' : fb.status); setResolveNote(fb.resolution_note || ""); }}>
                        Xử lý phản hồi
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm h-[500px] flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Activity size={18}/> Nhật ký hoạt động</CardTitle>
            <CardDescription>Các thao tác thêm, sửa, duyệt tài liệu trong môn học này.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              {history.length === 0 && <p className="text-sm text-gray-500">Chưa có lịch sử.</p>}
              {history.map((h, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="mt-0.5 text-gray-400"><CheckCircle2 size={16}/></div>
                  <div>
                    <p><span className="font-medium text-gray-700">{h.actor}</span> đã <span className="font-medium text-blue-600">{h.action}</span></p>
                    <p className="text-xs text-gray-500 mt-0.5">{h.object_type}: {h.object_id}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(h.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
