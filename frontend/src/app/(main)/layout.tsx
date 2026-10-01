import { MainShell } from "@/components/main-shell";

// Các trang học tập dùng chung một khung + thanh bên (D-54); URL không đổi (route group).
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainShell>{children}</MainShell>;
}
