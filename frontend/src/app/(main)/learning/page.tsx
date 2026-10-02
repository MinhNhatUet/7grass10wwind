"use client";

// Learning & Quiz (thay mockup tĩnh của TV4 bằng trang thật): sinh viên → Trung tâm học; giảng viên/người duyệt →
// Quiz Builder (soạn, phát hành, xem kết quả). Vai trò và môn lấy từ server (/me, /me/courses — BR-02).

import { useEffect, useState } from "react";
import { api, type CourseItem, type MeResponse } from "@/lib/api";
import { LearningHub } from "@/components/learning-hub";
import { QuizBuilder } from "@/components/quiz-builder";

export default function LearningPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [courses, setCourses] = useState<CourseItem[] | null>(null);

  useEffect(() => {
    Promise.all([api<MeResponse>("/me"), api<{ items: CourseItem[] }>("/me/courses")])
      .then(([m, c]) => { setMe(m); setCourses(c.items); })
      .catch(() => window.location.replace("/login"));
  }, []);

  const staff = me?.user.role === "lecturer" || me?.user.role === "reviewer";
  return (
    <div className="h-full overflow-y-auto bg-[#f3f4f6] dark:bg-[#081018] text-slate-800 dark:text-slate-100 font-sans p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="mt-1 text-2xl font-bold">{staff ? "Câu hỏi trắc nghiệm" : "Ôn tập & đề kiểm tra"}</h1>
          </div>
        </div>
        {!me || !courses ? (
          <p role="status" className="rounded-2xl bg-white dark:bg-[#12181f] p-6 animate-pulse">Đang tải…</p>
        ) : me.user.role === "admin" ? (
          <p className="rounded-2xl bg-white dark:bg-[#12181f] p-6 text-slate-500">Tài khoản quản trị không có quyền nội dung học tập.</p>
        ) : staff ? (
          <QuizBuilder courses={courses} />
        ) : (
          <LearningHub courses={courses} />
        )}
      </div>
    </div>
  );
}
