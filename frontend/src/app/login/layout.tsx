import { IBM_Plex_Sans, Montserrat } from "next/font/google";

// Font riêng trang đăng nhập: Montserrat cho tiêu đề/logo, IBM Plex Sans cho nội dung (có dấu tiếng Việt)
const heading = Montserrat({ subsets: ["latin", "vietnamese"], weight: ["600", "700", "800"], variable: "--font-login-head" });
const body = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-login-body" });

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${heading.variable} ${body.variable}`}>{children}</div>;
}
