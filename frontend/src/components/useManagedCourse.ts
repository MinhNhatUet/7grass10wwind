"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { CourseItem } from "@/lib/api";

/** Môn đang quản lý lấy từ ?course=; chỉ nhận môn server báo có quyền upload/duyệt (AC-12.1). */
export function useManagedCourse(courses: CourseItem[] | null, basePath: string, need: "manage" | "review" = "manage") {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get("course");
  const managed = (courses ?? []).filter((c) => (need === "review" ? c.can_review : c.can_upload || c.can_review));

  useEffect(() => {
    if (!courses) return;
    if (!courseId || !managed.some((c) => c.id === courseId)) {
      if (managed.length) router.replace(`${basePath}?course=${managed[0].id}`);
    }
  }, [courses, courseId, managed, basePath, router]);

  const valid = managed.some((c) => c.id === courseId) ? courseId : null;
  return {
    courseId: valid,
    managed,
    ready: courses !== null,
    setCourse: (id: string) => router.push(`${basePath}?course=${id}`),
  };
}
