"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { ApiError, login, register } from "@/lib/api";
import { errorMessage } from "@/lib/messages";
import { MSG } from "@/lib/messages";
import { setToken } from "@/lib/session";

// UI-01 — Đăng nhập (Wireframe mục 4, FR-01.1/01.2).
function LoginForm() {
  const router = useRouter();
  const expired = useSearchParams().get("expired") === "1";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return; // chặn double-submit
    setSubmitting(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await login(loginId.trim(), password)
          : await register(loginId.trim(), password, displayName.trim());
      setToken(res.access_token);
      router.replace("/chat");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(
        mode === "register"
          ? code === "HTTP_422"
            ? "Định danh tối thiểu 3 ký tự, mật khẩu tối thiểu 8 ký tự."
            : errorMessage(code)
          : code === "INVALID_CREDENTIALS" || code === "HTTP_422"
          ? MSG.invalidCredentials
          : code === "TOO_MANY_LOGIN_ATTEMPTS"
            ? MSG.tooManyAttempts
            : MSG.serviceError,
      );
      setPassword(""); // giữ định danh, xóa mật khẩu
      setSubmitting(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-inner">
          <span className="logo-mark lg">X</span>
          <h2>Kho tri thức hỗ trợ học thuật</h2>
          <p>Hỏi đáp có trích dẫn từ giáo trình đã được giảng viên duyệt — đúng môn, đúng quyền của bạn.</p>
        </div>
      </section>
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <h1 className="brand">{mode === "login" ? "Chào mừng trở lại!" : "Tạo tài khoản"}</h1>
        <p className="subtitle">
          {mode === "login" ? "Đăng nhập để tiếp tục khám phá tri thức." : "Tài khoản mới là Sinh viên — Quản trị sẽ cấp môn học."}
        </p>

        {expired && !error && (
          <div className="banner banner-warning" role="status">
            {MSG.sessionExpired}
          </div>
        )}

        {mode === "register" && (
          <>
            <label htmlFor="display_name" className="sr-only">
              Tên hiển thị
            </label>
            <input
              id="display_name"
              autoComplete="name"
              placeholder="Tên hiển thị"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </>
        )}
        <label htmlFor="login_id" className="sr-only">
          Định danh đăng nhập
        </label>
        <input
          id="login_id"
          name="login_id"
          autoComplete="username"
          placeholder="Định danh đăng nhập"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          required
        />
        <label htmlFor="password" className="sr-only">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" className="login-submit" disabled={submitting || !loginId.trim() || !password}>
          {submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"} <span aria-hidden="true">→</span>
        </button>

        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        <p className="hint">
          {mode === "login" ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
          </button>
        </p>
        {mode === "login" && <p className="hint">Quên mật khẩu? Liên hệ Quản trị.</p>}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
