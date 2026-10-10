// Nhận diện VAssistant dùng chung (trang đăng nhập, khu quản trị): màu thương hiệu + logo.
export const NAVY = "#134d8b";
export const RED = "#c72127";
export const HEAD_FONT = { fontFamily: "var(--font-login-head), ui-sans-serif, system-ui, sans-serif" };

/** Logo VAssistant: khung hội thoại navy chứa chữ V + chấm đỏ, vạch ngăn, chữ "V" đỏ "Assistant".
 *  `onDark`: nằm trên ảnh/nền tối (trang đăng nhập) → chữ trắng; ngược lại chữ navy (nền sáng), trắng khi dark mode. */
export function BrandLogo({ size = 44, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3 select-none" role="img" aria-label="VAssistant">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <path d="M10 4h28a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H22l-9 8v-8h-3a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8z" fill={NAVY} />
        <path d="M14 13l10 19 10-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="38" cy="10" r="5" fill={RED} stroke="#fff" strokeWidth="2" />
      </svg>
      <span className={`h-[0.9em] w-px ${onDark ? "bg-white/45" : "bg-black/15 dark:bg-white/20"}`} style={{ fontSize: size }} />
      <span className={`font-extrabold leading-none tracking-[-0.01em] ${onDark ? "drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]" : ""}`}
        style={{ ...HEAD_FONT, fontSize: size * 0.62 }}>
        <span className={onDark ? "text-[#ff5a60]" : "text-[#c72127] dark:text-[#ff5a60]"}>V</span>
        <span className={onDark ? "text-white" : "text-[#134d8b] dark:text-white"}>Assistant</span>
      </span>
    </span>
  );
}
