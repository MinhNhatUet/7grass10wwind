"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, type CourseItem, type MeResponse, logout, me, myCourses } from "./api";
import { clearToken, getToken } from "./session";

/** Tải /me + /me/courses; 401 → về /login?expired=1 (FR-01.2). Quyền chỉ lấy từ server (BR-02). */
export function useSession() {
  const router = useRouter();
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [courses, setCourses] = useState<CourseItem[] | null>(null);
  const [error, setError] = useState(false);

  const toLogin = useCallback(
    (expired: boolean) => {
      clearToken();
      router.replace(expired ? "/login?expired=1" : "/login");
    },
    [router],
  );

  const reload = useCallback(async () => {
    setError(false);
    try {
      const [m, c] = await Promise.all([me(), myCourses()]);
      setProfile(m);
      setCourses(c);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) toLogin(true);
      else setError(true);
    }
  }, [toLogin]);

  useEffect(() => {
    if (!getToken()) {
      toLogin(false);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu từ server, setState sau await
    void reload();
  }, [reload, toLogin]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // vẫn xóa phiên phía trình duyệt
    }
    toLogin(false);
  }, [toLogin]);

  /** Gọi khi một API trả 401 giữa chừng; trả true nếu đã xử lý. */
  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        toLogin(true);
        return true;
      }
      return false;
    },
    [toLogin],
  );

  return { profile, courses, error, reload, signOut, handleAuthError };
}
