import { brandFontVars } from "../brand-fonts";

// Khu quản trị dùng cùng font nhận diện VAssistant với trang đăng nhập
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={brandFontVars}>{children}</div>;
}
