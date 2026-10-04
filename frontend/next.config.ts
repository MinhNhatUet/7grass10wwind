import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev mặc định chỉ cho "localhost": mở bằng 127.0.0.1 thì Next chặn tài nguyên dev (HMR, chunk) → trang không chạy
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
