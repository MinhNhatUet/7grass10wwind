import { IBM_Plex_Sans, Montserrat } from "next/font/google";

// Font nhận diện VAssistant: Montserrat cho tiêu đề/logo, IBM Plex Sans cho nội dung (có dấu tiếng Việt).
// Dùng chung cho trang đăng nhập và khu quản trị.
const heading = Montserrat({ subsets: ["latin", "vietnamese"], weight: ["600", "700", "800"], variable: "--font-login-head" });
const body = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-login-body" });

export const brandFontVars = `${heading.variable} ${body.variable}`;
