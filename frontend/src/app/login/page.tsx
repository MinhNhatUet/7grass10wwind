"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { GraduationCap, PlayCircle, Presentation } from "lucide-react";

type DemoRole = "student" | "lecturer"; // không có admin: quản trị phải đăng nhập bằng mật khẩu
const DEMO_ROLES: { role: DemoRole; label: string; Icon: typeof GraduationCap }[] = [
  { role: "student", label: "Sinh viên", Icon: GraduationCap },
  { role: "lecturer", label: "Giảng viên", Icon: Presentation },
];

export default function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" }
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
    <div className="h-screen w-full bg-background overflow-hidden text-foreground">
      <main className="w-full h-full md:grid md:grid-cols-[57.2%_42.8%] overflow-hidden bg-background flex flex-col">
        
        {/* LEFT: logo (video login-left.mp4 bị .gitignore nên không có trong repo) */}
        <section className="relative overflow-hidden bg-gradient-to-br from-secondary/50 via-background to-secondary/30 border-b md:border-b-0 md:border-r border-border/70 h-[34vh] min-h-[210px] md:h-full md:min-h-0 flex items-center justify-center bg-mesh-radial" aria-label="EDU-04 product visual">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vedu-logo.png" alt="Vedu" className="max-w-[40%] max-h-[40%] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.08)] dark:drop-shadow-[0_12px_28px_rgba(255,255,255,0.06)] hover:scale-105 transition-transform duration-500" />
        </section>

        {/* RIGHT: clean HTML form */}
        <section className="relative bg-card/95 backdrop-blur-xl flex justify-center items-center shadow-floating flex-1 overflow-y-auto">
          <div className="w-[min(88%,525px)] py-[30px] md:w-[min(83%,525px)] md:py-[40px]">
            <header className="text-center mb-[32px] md:mb-[40px] login-fade-up">
              <h1 className="m-0 mb-[8px] text-[clamp(28px,2.8vw,38px)] leading-[1.1] tracking-[-0.035em] font-bold text-foreground">
                {isLoginView ? "Welcome Back" : "Tham gia EDU-04"}
              </h1>
              <p className="m-0 text-muted-foreground text-[14px] md:text-[15.5px] leading-[1.5]">
                {isLoginView ? "Đăng nhập để tiếp tục khám phá tri thức học thuật." : "Tạo tài khoản để bắt đầu trải nghiệm học thuật."}
              </p>
            </header>

            <form onSubmit={handleSubmit} noValidate>
              {!isLoginView && (
                <div className="mb-[12px] login-fade-up">
                  <label className="sr-only" htmlFor="name">Họ Tên</label>
                  <Input 
                    id="name" 
                    name="name" 
                    type="text"
                    autoComplete="name"
                    placeholder="Eg. Nguyễn Văn A"
                    className="w-full h-[48px] md:h-[52px] border-border/80 rounded-xl px-4 text-foreground bg-secondary/40 text-[14.5px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="mb-[12px] login-fade-up">
                <label className="sr-only" htmlFor="email">Định danh đăng nhập</label>
                <Input 
                  id="email" 
                  name="email" 
                  type="text"
                  autoComplete="username"
                  placeholder="Định danh đăng nhập (vd. sinhvien)"
                  className="w-full h-[48px] md:h-[52px] border-border/80 rounded-xl px-4 text-foreground bg-secondary/40 text-[14.5px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className={`login-fade-up ${isLoginView ? "mb-[20px] md:mb-[24px]" : "mb-[12px]"}`}>
                <label className="sr-only" htmlFor="password">Password</label>
                <Input 
                  id="password" 
                  name="password" 
                  type="password"
                  autoComplete={isLoginView ? "current-password" : "new-password"}
                  placeholder="Password"
                  className="w-full h-[48px] md:h-[52px] border-border/80 rounded-xl px-4 text-foreground bg-secondary/40 text-[14.5px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {!isLoginView && (
                <div className="mb-[20px] md:mb-[24px] login-fade-up">
                  <label className="sr-only" htmlFor="confirmPassword">Xác nhận Password</label>
                  <Input 
                    id="confirmPassword" 
                    name="confirmPassword" 
                    type="password"
                    autoComplete="new-password"
                    placeholder="Xác nhận Password"
                    className="w-full h-[48px] md:h-[52px] border-border/80 rounded-xl px-4 text-foreground bg-secondary/40 text-[14.5px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              )}

              <Button 
                type="submit" 
                disabled={isLoading}
                className="login-fade-up w-full h-[48px] md:h-[52px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[15px] font-semibold flex items-center justify-center gap-2.5 shadow-ambient hover:shadow-elevated active:scale-[0.985] transition-all"
              >
                <span>
                  {isLoading 
                    ? "Đang xử lý..." 
                    : isLoginView 
                      ? "Đăng nhập" 
                      : "Đăng ký"}
                </span>
                <span aria-hidden="true">→</span>
              </Button>

              {/* D-71: đăng nhập demo theo vai trò — server tự đăng nhập tài khoản demo, mật khẩu không xuống trình duyệt;
                  chỉ hiện khi server bật DEMO_LOGIN_ENABLED */}
              {demoEnabled && (<>
              <div className="my-[22px] md:my-[28px] grid grid-cols-[1fr_auto_1fr] items-center gap-[18px]" aria-hidden="true">
                <span className="h-px bg-border/80"></span>
                <b className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wider">HOẶC</b>
                <span className="h-px bg-border/80"></span>
              </div>

              <button
                type="button"
                onClick={() => setShowDemo((v) => !v)}
                aria-expanded={showDemo}
                className="flex h-[46px] md:h-[50px] w-full cursor-pointer items-center justify-center gap-[10px] rounded-xl border border-border/80 bg-card hover:bg-secondary/70 text-foreground text-[14px] font-medium shadow-2xs active:scale-[0.985] transition-all hover:border-primary/40"
              >
                <PlayCircle size={18} className="shrink-0 text-primary" aria-hidden="true" />
                <span>Đăng nhập demo</span>
              </button>
              {showDemo && (
                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Chọn vai trò demo">
                  {DEMO_ROLES.map(({ role, label, Icon }) => (
                    <button key={role} type="button" disabled={isLoading} onClick={() => void demoLogin(role)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-border/80 bg-card px-2 py-3 text-[13px] font-medium text-foreground shadow-2xs transition-all hover:border-primary/40 hover:bg-secondary/70 active:scale-[0.98] cursor-pointer disabled:opacity-50">
                      <Icon size={19} className="text-primary" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              </>)}
            </form>

            <p className="login-fade-up mt-6 text-center text-sm text-muted-foreground">
              {isLoginView ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
              <button 
                type="button"
                onClick={() => setIsLoginView(!isLoginView)}
                className="text-foreground font-semibold underline underline-offset-2 hover:text-primary transition-colors cursor-pointer bg-transparent border-0 p-0"
              >
                {isLoginView ? "Đăng ký ngay" : "Đăng nhập"}
              </button>
            </p>

            {error && (
              <p className="login-fade-up min-h-[20px] mt-4 text-center text-[13px] text-destructive bg-destructive/10 border border-destructive/20 px-4 py-2.5 rounded-xl font-medium" role="status" aria-live="polite">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
