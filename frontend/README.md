# Frontend EDU-04

Giao diện Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn/ui cho trợ lý học thuật EDU-04. Hướng dẫn chạy toàn bộ hệ thống (backend, dữ liệu, tài khoản): [docs/handover/huong_dan_chay.md](../docs/handover/huong_dan_chay.md).

## Chạy

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run dev                     # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` (mặc định `http://localhost:8000`) là địa chỉ backend. Frontend gọi thẳng `${NEXT_PUBLIC_API_URL}/api/v1`, không có proxy rewrite, nên origin của frontend phải có trong `CORS_ORIGINS` của backend. Biến này được gắn vào lúc build: đổi giá trị thì chạy lại `npm run dev` / `npm run build`.

| Lệnh | Việc |
|---|---|
| `npm run build` / `npm run start` | Bản build (output `standalone`, dùng trong `Dockerfile`) |
| `npm run lint` | ESLint (CI chạy cùng `npm run build`) |
| `npx tsc --noEmit` | Kiểm tra kiểu (không có script `typecheck`) |

## Cấu trúc `src/`

| Đường dẫn | Nội dung |
|---|---|
| `app/login/` | Đăng nhập, đăng ký, nút Đăng nhập demo (khi backend bật `DEMO_LOGIN_ENABLED`) |
| `app/(main)/` | Khung chung `MainShell` cho sinh viên, giảng viên, người duyệt: `/` Hỏi đáp, `/library`, `/learning`, `/learning/plans`, `/hub/manage`, `/hub/review`, `/dashboard` |
| `app/admin/` | Khu quản trị riêng `AdminShell`: quản lý tài liệu, giám sát, chi phí AI, cấu hình hạn mức, người dùng, môn học, nhật ký |
| `components/chat/` | Tin nhắn, badge trích dẫn `[n]` (rê chuột xem đoạn trích + trang) |
| `components/learning-cards.tsx` | Thẻ học: trắc nghiệm, flashcard, điền khuyết, tự luận, chẩn đoán, cấp cứu, lộ trình |
| `components/quiz-builder.tsx` | Soạn đề và tạo câu từ PDF của giảng viên |
| `lib/` | Gọi API (kèm mã hỗ trợ `X-Request-ID` khi lỗi ≥ 500), xử lý lỗi |

Thư mục `luno-admin-dashboard/`, `paper-document-editor/` và file `transform.js` là prototype độc lập, không thuộc ứng dụng; đang chờ người phụ trách giao diện xác nhận trước khi xóa.
