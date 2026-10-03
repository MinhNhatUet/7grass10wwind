import { NextRequest, NextResponse } from "next/server";

// M-07: token đăng nhập nằm trong localStorage → chặn XSS bằng CSP nonce: chỉ script mang nonce của request mới chạy
// (kể cả script chèn qua nội dung tài liệu/câu trả lời). Style vẫn cho inline vì React style={}, KaTeX, next-themes cần.
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").origin;

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: ${API_ORIGIN};
    font-src 'self' data:;
    connect-src 'self' ${API_ORIGIN};
    frame-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `.replace(/\s{2,}/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
