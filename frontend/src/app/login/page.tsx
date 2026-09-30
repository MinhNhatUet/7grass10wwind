"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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
      const payload: any = { login_id: email.trim(), password };
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
    <div className="h-screen w-full bg-white overflow-hidden">
      <main className="w-full h-full md:grid md:grid-cols-[57.2%_42.8%] overflow-hidden bg-white flex flex-col">
        
        {/* LEFT: logo (video login-left.mp4 của TV4 bị .gitignore nên không có trong repo) */}
        <section className="relative overflow-hidden bg-white h-[34vh] min-h-[210px] md:h-full md:min-h-0 flex items-center justify-center" aria-label="EDU-04 product visual">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vedu-logo.png" alt="Vedu" className="max-w-[40%] max-h-[40%] object-contain" />
        </section>

        {/* RIGHT: clean HTML form */}
        <section className="relative bg-white/98 flex justify-center items-center shadow-[-12px_0_34px_rgba(0,0,0,0.06)] flex-1 overflow-y-auto">
          <div className="w-[min(88%,525px)] py-[30px] md:w-[min(83%,525px)] md:py-[40px]">
            <header className="text-center mb-[32px] md:mb-[42px]">
              <h1 className="m-0 mb-[8px] text-[clamp(30px,3vw,40px)] leading-[1.08] tracking-[-0.045em] font-semibold text-[#12151a]">
                {isLoginView ? "Welcome Back!" : "Tham gia EDU-04"}
              </h1>
              <p className="m-0 text-[#777] text-[14px] md:text-[16px] leading-[1.45]">
                {isLoginView ? "Đăng nhập để tiếp tục khám phá tri thức." : "Tạo tài khoản để bắt đầu trải nghiệm học thuật."}
              </p>
            </header>

            <form onSubmit={handleSubmit} noValidate>
              {!isLoginView && (
                <div className="mb-[12px]">
                  <label className="sr-only" htmlFor="name">Họ Tên</label>
                  <Input 
                    id="name" 
                    name="name" 
                    type="text"
                    autoComplete="name"
                    placeholder="Eg. Nguyễn Văn A"
                    className="w-full h-[48px] md:h-[54px] border-[#d3d3d3] rounded-[14px] px-[18px] text-[#24272b] bg-white text-[15px] md:text-[16px] placeholder:text-[#747474] focus-visible:border-[#a8a8a8] focus-visible:ring-4 focus-visible:ring-[#27323d]/5 focus-visible:ring-offset-0"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="mb-[12px]">
                <label className="sr-only" htmlFor="email">Định danh đăng nhập</label>
                <Input 
                  id="email" 
                  name="email" 
                  type="text"
                  autoComplete="username"
                  placeholder="Định danh đăng nhập (vd. sinhvien01)"
                  className="w-full h-[48px] md:h-[54px] border-[#d3d3d3] rounded-[14px] px-[18px] text-[#24272b] bg-white text-[15px] md:text-[16px] placeholder:text-[#747474] focus-visible:border-[#a8a8a8] focus-visible:ring-4 focus-visible:ring-[#27323d]/5 focus-visible:ring-offset-0"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className={isLoginView ? "mb-[20px] md:mb-[24px]" : "mb-[12px]"}>
                <label className="sr-only" htmlFor="password">Password</label>
                <Input 
                  id="password" 
                  name="password" 
                  type="password"
                  autoComplete={isLoginView ? "current-password" : "new-password"}
                  placeholder="Password"
                  className="w-full h-[48px] md:h-[54px] border-[#d3d3d3] rounded-[14px] px-[18px] text-[#24272b] bg-white text-[15px] md:text-[16px] placeholder:text-[#747474] focus-visible:border-[#a8a8a8] focus-visible:ring-4 focus-visible:ring-[#27323d]/5 focus-visible:ring-offset-0"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {!isLoginView && (
                <div className="mb-[20px] md:mb-[24px]">
                  <label className="sr-only" htmlFor="confirmPassword">Xác nhận Password</label>
                  <Input 
                    id="confirmPassword" 
                    name="confirmPassword" 
                    type="password"
                    autoComplete="new-password"
                    placeholder="Xác nhận Password"
                    className="w-full h-[48px] md:h-[54px] border-[#d3d3d3] rounded-[14px] px-[18px] text-[#24272b] bg-white text-[15px] md:text-[16px] placeholder:text-[#747474] focus-visible:border-[#a8a8a8] focus-visible:ring-4 focus-visible:ring-[#27323d]/5 focus-visible:ring-offset-0"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              )}

              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-[50px] md:h-[56px] rounded-[38px] bg-[#27323d] text-white text-[16px] flex items-center justify-center gap-[12px] shadow-[0_12px_24px_rgba(39,50,61,0.13)] hover:translate-y-[-1px] hover:brightness-105 active:translate-y-0 transition-all hover:bg-[#27323d]"
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

              <div className="my-[24px] md:my-[32px] grid grid-cols-[1fr_auto_1fr] items-center gap-[20px] md:gap-[31px]" aria-hidden="true">
                <span className="h-[1px] bg-[#cfcfcf]"></span>
                <b className="text-[12px] font-semibold text-[#747474]">HOẶC</b>
                <span className="h-[1px] bg-[#cfcfcf]"></span>
              </div>

              <button
                type="button"
                className="flex h-[48px] w-full cursor-pointer items-center justify-center gap-[12px] rounded-full border border-solid border-[#dadce0] bg-white px-6 text-[14px] font-normal text-[#30343a] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#c5c8cc] hover:bg-[#f8f9fa] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4285f4] active:bg-[#f1f3f4] md:h-[54px] md:text-[15px]"
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

            <p className="mt-[16px] text-center text-[14px] text-[#333]">
              {isLoginView ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
              <button 
                type="button"
                onClick={() => setIsLoginView(!isLoginView)}
                className="text-[#202020] font-semibold underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0"
              >
                {isLoginView ? "Đăng ký ngay" : "Đăng nhập"}
              </button>
            </p>

            {error && (
              <p className="min-h-[20px] mt-[16px] text-center text-[13px] text-red-500 font-medium" role="status" aria-live="polite">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
