import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EDU-04 Knowledge Hub",
  description: "Kho tri thức hỗ trợ học thuật X",
  // App có chế độ tối riêng — khoá extension Dark Reader để nó không sửa DOM trước khi React hydrate (lỗi hydration)
  other: { "darkreader-lock": "true" },
};
import { ThemeProvider } from "@/components/theme-provider";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // M-07: nonce CSP do src/proxy.ts tạo theo từng request (đọc headers → mọi trang render động, đúng yêu cầu của nonce)
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <div className="min-h-full flex flex-col">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
