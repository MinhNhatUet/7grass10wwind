import type { NextConfig } from "next";

// Trình duyệt gọi /api/* cùng origin; Next chuyển tiếp sang FastAPI nên không cần mở CORS.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
