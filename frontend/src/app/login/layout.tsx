import { brandFontVars } from "../brand-fonts";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={brandFontVars}>{children}</div>;
}
