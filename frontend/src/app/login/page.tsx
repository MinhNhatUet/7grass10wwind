"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  ArrowRight, BookOpenCheck, Eye, EyeOff, GraduationCap, MessageSquareQuote, PlayCircle, Presentation, Route,
} from "lucide-react";
import { BrandLogo, HEAD_FONT, NAVY, RED } from "@/components/brand-logo";

// Nhận diện VAssistant dùng chung với khu quản trị (components/brand-logo)
const head = HEAD_FONT;

const FEATURES = [
  { Icon: MessageSquareQuote, text: "Hỏi đáp học thuật, mỗi ý đều có trích nguồn" },
  { Icon: BookOpenCheck, text: "Ôn tập theo bài: trắc nghiệm, flashcard, điền khuyết" },
  { Icon: Route, text: "Đánh giá phần đã học và lộ trình học cá nhân" },
];

type DemoRole = "student" | "lecturer"; // không có admin: quản trị phải đăng nhập bằng mật khẩu
const DEMO_ROLES: { role: DemoRole; label: string; Icon: typeof GraduationCap }[] = [
  { role: "student", label: "Sinh viên", Icon: GraduationCap },
  { role: "lecturer", label: "Giảng viên", Icon: Presentation },
];

const field =
  "w-full h-[48px] rounded-lg border border-black/10 dark:border-white/15 bg-[#f5f6f8] focus:bg-white dark:bg-[#161b22] px-3.5 text-[15px] " +
  "text-[#2e2e2e] dark:text-white placeholder:text-black/40 dark:placeholder:text-white/35 outline-none transition " +
  "focus:border-[#134d8b] focus:ring-2 focus:ring-[#134d8b]/20 dark:focus:border-[#5b9be0]";
const label = "mb-1.5 block text-[14px] font-semibold text-[#2e2e2e] dark:text-white/90";

export default function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false); // chỉ hiện nút khi server bật DEMO_LOGIN_ENABLED
  const router = useRouter();

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/demo-login`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setDemoEnabled(Boolean(d.enabled)))
      .catch(() => setDemoEnabled(false));
  }, []);

  async function demoLogin(role: DemoRole) {
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(response.status === 404 && !data.error?.message
          ? "Đăng nhập demo đang tắt trên máy chủ này."
          : data.error?.message || "Đăng nhập demo thất bại.");
      }
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập demo thất bại.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    gsap.fromTo(
      ".login-fade-up",
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" }
    );
  }, [isLoginView]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isLoginView && !name.trim()) {
      setError("Vui lòng nhập họ tên.");
      return;
    }

    // login_id là định danh bất kỳ (PRD 9.1, D-17) — không bắt buộc email; server tự kiểm tra tài khoản
    if (!email.trim()) {
      setError("Vui lòng nhập định danh đăng nhập.");
      return;
    }

    if (!password) {
      setError("Vui lòng nhập mật khẩu.");
      return;
    }

    if (!isLoginView && password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = isLoginView ? "/api/v1/auth/login" : "/api/v1/auth/register";
      const payload: { login_id: string; password: string; display_name?: string } = { login_id: email.trim(), password };
      if (!isLoginView) {
        payload.display_name = name;
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errMsg = isLoginView ? "Đăng nhập thất bại" : "Đăng ký thất bại";
        if (errorData.error?.message) {
          errMsg = errorData.error.message;
        } else if (errorData.detail) {
          errMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      router.push(data.user?.role === "admin" ? "/admin" : "/"); // D-61: admin vào thẳng khu quản trị
    } catch (err) {
      setError(err instanceof Error ? err.message : (isLoginView ? "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin." : "Đăng ký thất bại. Vui lòng thử lại."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full text-[#2e2e2e] dark:text-white lg:grid lg:h-screen lg:grid-cols-[58%_42%]"
      style={{ fontFamily: "var(--font-login-body), ui-sans-serif, system-ui, sans-serif" }}>
      {/* Góc ảnh: ảnh thư viện (public/login-bg.jpg) + logo trên cùng + mô tả ở đáy. Chỉ phủ dải tối ở trên/dưới để chữ
          đọc được, phần giữa ảnh giữ nguyên. Khung gần vuông → ảnh phủ đủ chiều cao, thu nhỏ nên nét. */}
      <section className="relative flex h-[38vh] min-h-[260px] flex-col justify-between overflow-hidden bg-[#2a2016] bg-cover bg-center p-6 text-white lg:h-full lg:p-12"
        style={{ backgroundImage: "url(/login-bg.jpg)" }} aria-label="VAssistant">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/45 to-transparent lg:h-[55%]" />

        <header className="login-fade-up relative">
          <BrandLogo size={44} onDark />
        </header>

        <div className="relative max-w-[600px]">
          <h1 className="login-fade-up text-[24px] font-extrabold text-white leading-[1.15] tracking-[-0.02em] lg:text-[38px]" style={head}>
            Kho tri thức hỗ trợ học thuật
          </h1>
          <p className="login-fade-up mt-2 text-[14px] leading-relaxed text-white/85 lg:mt-3 lg:text-[17px]">
            Học đúng tài liệu môn, có nguồn rõ ràng.
          </p>
          <ul className="mt-7 hidden gap-3.5 lg:grid">
            {FEATURES.map(({ Icon, text }) => (
              <li key={text} className="login-fade-up flex items-center gap-3 text-[15px] text-white/95">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/15 backdrop-blur-sm">
                  <Icon size={18} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <p className="login-fade-up mt-8 hidden text-[12px] font-medium text-white/60 lg:block">© 2026 VAssistant · EDU-04 · Team 7 cỏ 10 gió</p>
        </div>
      </section>

      {/* Góc đăng nhập: form đặt thẳng trên nền trắng cả nửa phải — không hộp/viền/bóng (chỉ dùng khoảng trắng) */}
      <main className="flex items-center justify-center bg-white px-6 py-10 dark:bg-[#0d1117] sm:px-10 lg:overflow-y-auto">
          <section className="login-fade-up w-full max-w-[400px]">
            <h2 className="text-[26px] font-bold uppercase leading-tight tracking-[0.01em] sm:text-[30px]" style={head}>
              {isLoginView
                ? <>Chào mừng <span style={{ color: RED }}>trở lại</span></>
                : <>Tạo <span style={{ color: RED }}>tài khoản</span></>}
            </h2>
            <p className="mt-1.5 text-[14px] text-black/70 dark:text-white/70">
              {isLoginView ? "Đăng nhập bằng tài khoản được cấp để tiếp tục" : "Tài khoản tự đăng ký là tài khoản sinh viên"}
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              {!isLoginView && (
                <div>
                  <label className={label} htmlFor="name">Họ tên</label>
                  <input id="name" name="name" type="text" autoComplete="name" placeholder="Nguyễn Văn A"
                    className={field} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              <div>
                <label className={label} htmlFor="email">Tên đăng nhập</label>
                <input id="email" name="email" type="text" autoComplete="username" placeholder="vd. sinhvien"
                  className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="password">Mật khẩu</label>
                <div className="relative">
                  <input id="password" name="password" type={showPassword ? "text" : "password"}
                    autoComplete={isLoginView ? "current-password" : "new-password"} placeholder="••••••••"
                    className={`${field} pr-11`} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center border-0 bg-transparent text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              {!isLoginView && (
                <div>
                  <label className={label} htmlFor="confirmPassword">Xác nhận mật khẩu</label>
                  <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"}
                    autoComplete="new-password" placeholder="••••••••" className={field}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
              )}

              {error && (
                <p className="rounded-md bg-[#c72127]/10 px-3 py-2 text-[13px] font-medium text-[#c72127] dark:text-[#ff8a8e]" role="status" aria-live="polite">
                  {error}
                </p>
              )}

              <button type="submit" disabled={isLoading}
                className="mt-2 flex h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-0 text-[15px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: NAVY }}>
                {isLoading ? "Đang xử lý…" : isLoginView ? "Đăng nhập hệ thống" : "Tạo tài khoản"}
                {!isLoading && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-black/10 pt-4 dark:border-white/10">
              <button type="button" onClick={() => { setIsLoginView(!isLoginView); setError(""); }}
                className="cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-[12px] font-bold uppercase tracking-[0.05em] sm:text-[13px] underline decoration-dotted underline-offset-4 dark:!text-[#7fb3ea]"
                style={{ ...head, color: NAVY }}>
                {isLoginView ? "Chưa có tài khoản?" : "Đã có tài khoản?"}
              </button>
              {/* D-71: đăng nhập demo theo vai trò — server tự đăng nhập tài khoản demo, mật khẩu không xuống trình duyệt;
                  chỉ hiện khi server bật DEMO_LOGIN_ENABLED */}
              {demoEnabled && (
                <button type="button" onClick={() => setShowDemo((v) => !v)} aria-expanded={showDemo}
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-transparent px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] dark:!border-[#7fb3ea]/40 dark:!text-[#7fb3ea]"
                  style={{ ...head, color: NAVY, borderColor: `${NAVY}55` }}>
                  <PlayCircle size={14} aria-hidden="true" /> Dùng thử
                </button>
              )}
            </div>
            {demoEnabled && showDemo && (
              <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Chọn vai trò demo">
                {DEMO_ROLES.map(({ role, label: text, Icon }) => (
                  <button key={role} type="button" disabled={isLoading} onClick={() => void demoLogin(role)}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-black/10 bg-transparent px-2 py-3 text-[13px] font-medium text-inherit transition hover:border-[#134d8b]/50 hover:bg-[#134d8b]/5 disabled:opacity-50 dark:border-white/15">
                    <Icon size={20} style={{ color: NAVY }} className="dark:!text-[#7fb3ea]" aria-hidden="true" />
                    {text}
                  </button>
                ))}
              </div>
            )}
          </section>
      </main>
    </div>
  );
}
