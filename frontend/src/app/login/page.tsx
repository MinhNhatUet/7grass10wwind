"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";

export default function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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

    if (!email || !email.includes("@")) {
      setError("Vui lòng nhập địa chỉ email hợp lệ.");
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
      const payload: any = { login_id: email, password };
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
      
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : (isLoginView ? "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin." : "Đăng ký thất bại. Vui lòng thử lại."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-background overflow-hidden text-foreground">
      <main className="w-full h-full md:grid md:grid-cols-[57.2%_42.8%] overflow-hidden bg-background flex flex-col">
        
        {/* LEFT: actual moving video */}
        <section className="relative overflow-hidden bg-secondary h-[34vh] min-h-[210px] md:h-full md:min-h-0" aria-label="EDU-04 product visual">
          <video 
            autoPlay 
            muted 
            loop 
            playsInline 
            preload="auto" 
            className="absolute inset-0 w-full h-full object-cover object-center"
          >
            <source src="/assets/login-left.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent"></div>
        </section>

        {/* RIGHT: clean HTML form */}
        <section className="relative bg-card flex justify-center items-center shadow-[-12px_0_34px_rgba(0,0,0,0.06)] flex-1 overflow-y-auto">
          <div className="w-[min(88%,525px)] py-[30px] md:w-[min(83%,525px)] md:py-[40px]">
            <header className="text-center mb-[32px] md:mb-[42px] login-fade-up">
              <h1 className="m-0 mb-[8px] text-[clamp(30px,3vw,40px)] leading-[1.08] tracking-[-0.045em] font-bold text-foreground">
                {isLoginView ? "Welcome Back!" : "Tham gia EDU-04"}
              </h1>
              <p className="m-0 text-muted-foreground text-[14px] md:text-[16px] leading-[1.45]">
                {isLoginView ? "Đăng nhập để tiếp tục khám phá tri thức." : "Tạo tài khoản để bắt đầu trải nghiệm học thuật."}
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
                    className="w-full h-[48px] md:h-[54px] border-border rounded-xl px-4 text-foreground bg-secondary/30 text-[15px] md:text-[16px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="mb-[12px] login-fade-up">
                <label className="sr-only" htmlFor="email">Email</label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email"
                  autoComplete="email"
                  placeholder="Eg. sinhvien@school.edu.vn"
                  className="w-full h-[48px] md:h-[54px] border-border rounded-xl px-4 text-foreground bg-secondary/30 text-[15px] md:text-[16px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
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
                  className="w-full h-[48px] md:h-[54px] border-border rounded-xl px-4 text-foreground bg-secondary/30 text-[15px] md:text-[16px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
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
                    className="w-full h-[48px] md:h-[54px] border-border rounded-xl px-4 text-foreground bg-secondary/30 text-[15px] md:text-[16px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              )}

              <Button 
                type="submit" 
                disabled={isLoading}
                className="login-fade-up w-full h-[50px] md:h-[56px] rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-[16px] flex items-center justify-center gap-3 shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all font-medium"
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

              <div className="login-fade-up my-[24px] md:my-[32px] grid grid-cols-[1fr_auto_1fr] items-center gap-[20px] md:gap-[31px]" aria-hidden="true">
                <span className="h-px bg-border"></span>
                <b className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">HOẶC</b>
                <span className="h-px bg-border"></span>
              </div>

              <button
                type="button"
                className="login-fade-up flex h-[48px] md:h-[54px] w-full cursor-pointer items-center justify-center gap-[12px] rounded-full border border-border bg-card hover:bg-secondary text-foreground text-[14px] md:text-[15px] font-medium shadow-sm transition-all hover:border-primary/30"
              >
                <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04l3.34-2.59Z" />
                  <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59C7.19 7.71 9.4 5.95 12 5.95Z" />
                </svg>
                <span>{isLoginView ? "Đăng nhập với Google" : "Đăng ký bằng Google"}</span>
              </button>
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
              <p className="login-fade-up min-h-[20px] mt-4 text-center text-[13px] text-destructive bg-destructive/10 px-4 py-2 rounded-lg font-medium" role="status" aria-live="polite">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
