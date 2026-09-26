# PLAN TASK CHI TIẾT — TV4 (Đinh Văn Bình)
**Dự án:** EDU-04 · Kho tri thức hỗ trợ học thuật X  
**Vai trò:** Frontend · UX/UI · Tích hợp · Triển khai  
**Lịch:** 6 tuần (Tuần 1–6); **Cổng bản cơ bản: cuối Tuần 3**

---

## 📌 Tổng quan công việc TV4

| Tuần | Chủ đề chính | Kết quả bàn giao |
|---|---|---|
| 1 | Thiết lập nền tảng UI & Deploy | App chạy được trên môi trường demo |
| 2 | Hoàn tất luồng chức năng cơ bản | Giao diện 3 trợ lý + Hub tích hợp backend |
| 3 | Kiểm chứng & nghiệm thu cơ bản | Dashboard GV hoàn tất, UAT pass |
| 4 | Nâng cao đợt 1 | Dashboard vận hành, quota UI |
| 5 | Nâng cao đợt 2 | OCR/cache UI, polish |
| 6 | Ổn định & bàn giao | Demo, tài liệu, regression |

---

## 🗓️ TUẦN 1 — Thiết lập nền tảng UI & Deploy

### T1.1 · Chốt stack & thiết lập dự án Next.js

#### T1.1.1 · Xác nhận công nghệ
- T1.1.1.a — Đọc kỹ PRD mục 8 (Định hướng kỹ thuật): Next.js frontend + FastAPI backend
- T1.1.1.b — Thống nhất với nhóm: Next.js (App Router hay Pages Router?)
- T1.1.1.c — Chốt thư viện UI: shadcn/ui + Tailwind CSS hoặc Chakra UI
- T1.1.1.d — Ghi quyết định vào decision log (WORKLOG.md hoặc JOURNAL.md)

#### T1.1.2 · Khởi tạo project Next.js
- T1.1.2.a — Tạo thư mục `frontend/` trong repo P-134
- T1.1.2.b — Chạy `npx create-next-app@latest` với TypeScript, ESLint, Tailwind
- T1.1.2.c — Cấu hình `.env.local` với `NEXT_PUBLIC_API_URL` trỏ đến FastAPI
- T1.1.2.d — Commit lên nhánh `feat/frontend-setup` và mở PR

#### T1.1.3 · Cấu hình CI cho frontend
- T1.1.3.a — Thêm job `lint` và `build` vào `.github/workflows/ci.yml`
- T1.1.3.b — Xác nhận CI xanh trên GitHub Actions

### T1.2 · Xây dựng Design System cơ bản

#### T1.2.1 · Định nghĩa token thiết kế
- T1.2.1.a — Định nghĩa color palette (primary, secondary, neutral, error, success)
- T1.2.1.b — Định nghĩa typography scale (heading 1–4, body, caption)
- T1.2.1.c — Định nghĩa spacing scale và border-radius tokens
- T1.2.1.d — Tạo file `styles/tokens.css` hoặc config trong `tailwind.config.ts`

#### T1.2.2 · Tạo các component primitive
- T1.2.2.a — `Button` (primary, secondary, ghost, destructive + states)
- T1.2.2.b — `Input` + `Textarea` (với error state và label)
- T1.2.2.c — `Badge` (role: SV/GV, trạng thái tài liệu)
- T1.2.2.d — `Card` (document card, chat bubble)
- T1.2.2.e — `Spinner` / `Skeleton` loading placeholder

#### T1.2.3 · Layout components
- T1.2.3.a — `AppShell`: sidebar + header + content area
- T1.2.3.b — `Sidebar`: navigation items theo role (SV vs GV)
- T1.2.3.c — `TopBar`: breadcrumb, user avatar, logout button

### T1.3 · Màn hình đăng nhập (UI-01)

#### T1.3.1 · Giao diện đăng nhập
- T1.3.1.a — Tạo trang `/login` theo wireframe UI-01
- T1.3.1.b — Form: username/email + password + nút "Đăng nhập"
- T1.3.1.c — Xử lý trạng thái: loading, lỗi sai mật khẩu, lỗi server
- T1.3.1.d — Redirect về trang chủ theo role sau khi đăng nhập thành công

#### T1.3.2 · Tích hợp auth API
- T1.3.2.a — Gọi `POST /api/auth/login` từ FastAPI (TV2 cung cấp)
- T1.3.2.b — Lưu JWT token vào `httpOnly cookie` hoặc `sessionStorage` (thống nhất với TV2)
- T1.3.2.c — Tạo `AuthContext` và `useAuth()` hook
- T1.3.2.d — Tạo middleware Next.js để bảo vệ route (redirect nếu chưa auth)

### T1.4 · Triển khai môi trường demo (Deploy)

#### T1.4.1 · Chọn nền tảng deploy
- T1.4.1.a — Đánh giá: Vercel (frontend) + Railway/Render (backend) hoặc VPS + Docker Compose
- T1.4.1.b — Thống nhất với nhóm và ghi quyết định
- T1.4.1.c — Tạo tài khoản/project trên nền tảng đã chọn

#### T1.4.2 · Cấu hình Docker cho frontend
- T1.4.2.a — Viết `Dockerfile` cho Next.js (multi-stage build)
- T1.4.2.b — Thêm service `frontend` vào `docker-compose.yml`
- T1.4.2.c — Test build Docker local: `docker compose up --build`

#### T1.4.3 · Deploy lần đầu
- T1.4.3.a — Deploy app lên môi trường demo (dù chỉ có trang login)
- T1.4.3.b — Xác nhận URL truy cập được từ bên ngoài
- T1.4.3.c — Ghi URL vào `milestone_01_edu04.md` bảng bằng chứng

---

## 🗓️ TUẦN 2 — Hoàn tất luồng chức năng cơ bản

### T2.1 · Màn hình Unified Chat (Trang chủ - UI-02)

#### T2.1.1 · Unified Chat interface (Agent điều phối tự động)
- T2.1.1.a — Layout: sidebar lịch sử hội thoại (trái) + vùng chat (giữa) + panel nguồn (phải)
- T2.1.1.b — Input vùng nhập câu hỏi + nút gửi + phím tắt Ctrl+Enter
- T2.1.1.c — Streaming response: hiển thị text dần từng token (SSE hoặc chunked fetch)
- T2.1.1.d — Giao diện hiển thị badge: "Đang trả lời bởi [Tên Trợ Lý]" do backend phân loại tự động
- T2.2.1.c — Streaming response: hiển thị text dần từng token (SSE hoặc chunked fetch)
- T2.2.1.d — Typing indicator khi đang chờ phản hồi

#### T2.1.2 · Hiển thị câu trả lời có nguồn (citation)
- T2.1.2.a — Render markdown trong câu trả lời (thư viện `react-markdown`)
- T2.1.2.b — Footnote/inline citation `[1]`, `[2]` click mở panel nguồn
- T2.1.2.c — Panel nguồn: tên file, trang/slide, đoạn trích nổi bật (highlight)
- T2.1.2.d — Nút "Mở tài liệu gốc" → link đến Knowledge Hub đúng trang

#### T2.1.3 · Trường hợp đặc biệt
- T2.1.3.a — Không đủ nguồn: hiển thị banner "Chưa đủ cơ sở..." + gợi ý từ khóa
- T2.1.3.b — Bài tính điểm: hiển thị thông báo chuyển sang giải thích khái niệm
- T2.1.3.c — Lỗi server/timeout: toast lỗi + nút thử lại
- T2.1.3.d — Nút phản hồi chất lượng: 👍 👎 + form báo lỗi tuỳ chọn

#### T2.1.4 · Lịch sử hội thoại
- T2.1.4.a — Gọi API lấy danh sách session (`GET /api/chat/sessions`)
- T2.1.4.b — Load lại hội thoại cũ khi click vào session
- T2.1.4.c — Nút xóa session (confirm dialog)

### T2.2 · Knowledge Hub (UI-06)

#### T2.2.1 · Trang tìm kiếm tài liệu
- T2.2.1.a — Search bar nổi bật + bộ lọc: môn học, loại file (PDF/PPTX), ngày
- T2.2.1.b — Kết quả: danh sách document cards (tên, môn, loại, ngày duyệt)
- T2.2.1.c — Highlight từ khóa trong đoạn trích kết quả
- T2.2.1.d — Pagination hoặc infinite scroll

#### T2.2.2 · Trang xem tài liệu
- T2.2.2.a — Hiển thị PDF inline (`react-pdf` hoặc `<iframe>`) với đúng trang từ citation
- T2.2.2.b — Hiển thị PPTX: convert → ảnh hoặc text (nhận từ backend)
- T2.2.2.c — Kiểm tra quyền: nếu không có quyền → 403 page có hướng dẫn

### T2.3 · Khu vực giảng viên cơ bản (UI-07)

#### T2.3.1 · Upload tài liệu
- T2.3.1.a — Drag & drop + click to upload (accept PDF, PPTX)
- T2.3.1.b — Progress bar upload + trạng thái xử lý (pending → processing → ready to review)
- T2.3.1.c — Hiển thị lỗi nếu file không hợp lệ hoặc OCR không hỗ trợ
- T2.3.1.d — Preview kết quả trích xuất trước khi gửi duyệt

#### T2.3.2 · Giao diện theo dõi tài liệu đã upload
- T2.3.2.a — Danh sách file đã tải: tên, trạng thái, ngày, người duyệt (nếu có)
- T2.3.2.b — Nút hủy/xóa tài liệu đang chờ duyệt

---

## 🗓️ TUẦN 3 — Kiểm chứng & Nghiệm thu bản cơ bản ⭐

### T3.1 · Dashboard Giảng viên MUST (UI-09) — Hoàn tất

#### T3.1.1 · Quản lý tài liệu & hàng đợi duyệt
- T3.1.1.a — Tab "Tài liệu của tôi": danh sách đầy đủ theo môn + filter trạng thái
- T3.1.1.b — Tab "Hàng đợi duyệt": tài liệu chờ mình duyệt (GV khác upload)
- T3.1.1.c — Màn hình duyệt: xem preview + trích xuất + form approve/reject + ghi chú
- T3.1.1.d — Đảm bảo: **người upload ≠ người duyệt** (ẩn nút duyệt nếu là chính mình)

#### T3.1.2 · Lịch sử quyết định duyệt
- T3.1.2.a — Timeline/log: ai duyệt, khi nào, quyết định gì, ghi chú gì
- T3.1.2.b — Nút thu hồi tài liệu đã phát hành (với confirm + nhập lý do)
- T3.1.2.c — Sau thu hồi: UI cập nhật ngay, toast thông báo, check backend đã xóa khỏi index

#### T3.1.3 · Phản hồi & thống kê
- T3.1.3.a — Xem danh sách phản hồi 👍/👎 từ SV cho tài liệu của môn mình
- T3.1.3.b — Thống kê đơn giản: số câu hỏi theo môn, tài liệu được dùng nhiều nhất
- T3.1.3.c — Filter theo khoảng thời gian

### T3.2 · Kiểm thử tích hợp & UAT

#### T3.2.1 · Kiểm thử luồng SV
- T3.2.1.a — Đăng nhập SV → chọn môn → hỏi Academic Assistant → xem citation → mở tài liệu
- T3.2.1.b — Hỏi bài tính điểm → xác nhận bị từ chối đúng cách
- T3.2.1.c — Tìm kiếm Hub → xem tài liệu đúng quyền → không thấy tài liệu ngoài môn

#### T3.2.2 · Kiểm thử luồng GV
- T3.2.2.a — Upload tài liệu → chờ xử lý → GV khác duyệt → SV tìm được
- T3.2.2.b — Thu hồi tài liệu → xác nhận SV không còn truy cập được
- T3.2.2.c — Thử tự duyệt tài liệu của mình → xác nhận bị chặn

#### T3.2.3 · Kiểm thử phân quyền (ACL)
- T3.2.3.a — SV truy cập trực tiếp URL tài liệu môn không được cấp → 403
- T3.2.3.b — SV thử API với token hợp lệ nhưng sai môn → 403
- T3.2.3.c — Cache không rò rỉ nội dung sau khi quyền bị thu hồi

#### T3.2.4 · Fix lỗi & polish UI
- T3.2.4.a — Fix toàn bộ lỗi phát hiện trong UAT trước khi đóng milestone
- T3.2.4.b — Responsive check: mobile (≥375px), tablet (≥768px), desktop (≥1280px)
- T3.2.4.c — Accessibility cơ bản: contrast ratio, focus state, aria-label cho các phần tử tương tác

### T3.3 · Cập nhật tài liệu & chuẩn bị demo

#### T3.3.1 · Tài liệu kỹ thuật frontend
- T3.3.1.a — Cập nhật README hướng dẫn chạy local frontend
- T3.3.1.b — Ghi chú các biến môi trường cần thiết trong `.env.example`
- T3.3.1.c — Ghi lại quyết định thiết kế quan trọng vào JOURNAL.md

#### T3.3.2 · Chuẩn bị demo
- T3.3.2.a — Chuẩn bị kịch bản demo: 3 luồng chính (SV, GV, Admin)
- T3.3.2.b — Tạo tài khoản demo với dữ liệu mẫu đầy đủ
- T3.3.2.c — Xác nhận URL demo truy cập được, không bị timeout

---

## 🗓️ TUẦN 4 — Nâng cao đợt 1

### T4.1 · Dashboard vận hành & Quota UI

#### T4.1.1 · Trang monitoring (Admin)
- T4.1.1.a — Biểu đồ độ trễ p50/p95 theo thời gian (chart library: Recharts/Chart.js)
- T4.1.1.b — Hiển thị token usage và ước tính chi phí theo ngày/tuần
- T4.1.1.c — Bảng top câu hỏi, top môn học theo lượng request

#### T4.1.2 · Giao diện cấu hình quota
- T4.1.2.a — Form cài đặt: hạn mức token/user/day, hạn mức/môn
- T4.1.2.b — Hiển thị cảnh báo khi người dùng gần đạt quota (toast/banner)
- T4.1.2.c — Màn hình "Đã đạt giới hạn" thân thiện với hướng dẫn

### T4.2 · Cải thiện UX (Đã gộp thiết kế)
*(Phần chọn trợ lý thủ công đã được lược bỏ do Agent backend đảm nhiệm điều phối tự động)*

---

## 🗓️ TUẦN 5 — Nâng cao đợt 2

### T5.1 · UI cho tính năng OCR & Cache

#### T5.1.1 · Thông báo trạng thái OCR
- T5.1.1.a — Badge "Đang xử lý OCR" cho PDF scan đang được nhận dạng
- T5.1.1.b — Thông báo rõ nếu OCR thất bại: "File này chưa hỗ trợ trích xuất văn bản"
- T5.1.1.c — Kết quả OCR xong: notification (real-time nếu có WebSocket) hoặc polling

#### T5.1.2 · Tối ưu hiệu năng frontend
- T5.1.2.a — Code splitting: lazy load các trang nặng (dashboard, hub)
- T5.1.2.b — Image optimization: dùng `next/image` cho ảnh preview tài liệu
- T5.1.2.c — Debounce search input (300ms) để giảm API call

### T5.2 · Mở rộng RAGAS & Eval UI (hỗ trợ TV1)

#### T5.2.1 · Trang xem kết quả evaluation
- T5.2.1.a — Bảng kết quả 100 mẫu holdout: câu hỏi, điểm rubric, pass/fail
- T5.2.1.b — Filter theo nhóm câu hỏi (5 nhóm × 20)
- T5.2.1.c — Export CSV kết quả để báo cáo

---

## 🗓️ TUẦN 6 — Ổn định & Bàn giao

### T6.1 · Regression & Final QA

#### T6.1.1 · Kiểm thử toàn diện
- T6.1.1.a — Chạy lại toàn bộ kịch bản UAT từ tuần 3
- T6.1.1.b — Kiểm thử cross-browser: Chrome, Firefox, Edge
- T6.1.1.c — Kiểm thử trên mobile (375px) các luồng chính
- T6.1.1.d — Không có lỗi console error nghiêm trọng nào trong production build

#### T6.1.2 · Performance check
- T6.1.2.a — Lighthouse score ≥ 80 (Performance, Accessibility, Best Practices)
- T6.1.2.b — First Contentful Paint < 3s trên kết nối 4G

### T6.2 · Tài liệu bàn giao

#### T6.2.1 · Tài liệu kỹ thuật
- T6.2.1.a — Hoàn thiện README: hướng dẫn cài đặt local, build Docker, deploy
- T6.2.1.b — Tài liệu API integration: các endpoint frontend dùng + format request/response
- T6.2.1.c — Danh sách hạn chế còn lại (known limitations)

#### T6.2.2 · Hướng dẫn người dùng
- T6.2.2.a — Hướng dẫn ngắn cho SV (PDF/Markdown): cách đăng nhập, đặt câu hỏi, đọc nguồn
- T6.2.2.b — Hướng dẫn cho GV: upload, duyệt, thu hồi, xem dashboard
- T6.2.2.c — FAQ: câu hỏi thường gặp và cách xử lý

#### T6.2.3 · Demo cuối
- T6.2.3.a — Chuẩn bị slide giới thiệu: vấn đề → giải pháp → demo live → kết quả KPI
- T6.2.3.b — Rehearsal demo với cả nhóm trước ngày bảo vệ
- T6.2.3.c — Backup plan: video record sẵn phòng khi demo live gặp sự cố

---

## 📋 Giao diện cần xây dựng — Checklist tổng

| ID | Màn hình | Tuần | Trạng thái |
|---|---|---|---|
| UI-01 | Đăng nhập | 1 | ✅ |
| UI-02 | Unified Chat (Giao diện Chat trung tâm) | 2 | ⬜ |
| UI-03 | *(Đã gộp vào UI-02 do backend định tuyến)* | - | - |
| UI-04 | *(Đã gộp vào UI-02 do backend định tuyến)* | - | - |
| UI-05 | *(Đã gộp vào UI-02 do backend định tuyến)* | - | - |
| UI-06 | Knowledge Hub (Search + View) | 2 | ⬜ |
| UI-07 | GV Upload & Quản lý tài liệu | 2 | ✅ |
| UI-08 | GV Duyệt tài liệu | 3 | ⬜ |
| UI-09 | Dashboard Giảng viên (MUST) | 3 | ⬜ |
| UI-10 | Admin Dashboard vận hành | 4 | ⬜ |

---

## ⚠️ Rủi ro & Biện pháp riêng cho TV4

| Rủi ro | Biện pháp |
|---|---|
| API backend chưa sẵn sàng | Mock API với `msw` hoặc hardcode fixture JSON để UI không bị block |
| Streaming SSE phức tạp | Prototype sớm ngày 1 tuần 2; fallback về polling nếu không kịp |
| Dashboard GV quá phức tạp | Ưu tiên: hàng đợi duyệt + thu hồi → thống kê để sau |
| Deploy gặp sự cố | Giữ Docker Compose local luôn chạy được; demo có thể fallback về localhost |
| Scope creep từ nhóm | Từ chối tính năng mới sau tuần 3, log vào backlog nâng cao |

---

## 🔗 Phụ thuộc vào thành viên khác

| Cần từ | Nội dung cần | Thời hạn cần |
|---|---|---|
| TV2 | API spec auth: `POST /login`, format JWT, cấu trúc role | Ngày 1–2 Tuần 1 |
| TV2 | API spec upload document + trạng thái processing | Ngày 1–2 Tuần 2 |
| TV3 | API spec chat streaming endpoint (`POST /chat`) + citation format | Ngày 3–4 Tuần 1 |
| TV3 | API spec search Knowledge Hub (`GET /search`) | Ngày 1 Tuần 2 |
| TV1 | Kịch bản UAT chi tiết + tài khoản/data mẫu | Ngày 1 Tuần 3 |

---

*Tài liệu này phục vụ TV4 lập kế hoạch cá nhân. Cập nhật trạng thái ⬜→✅ sau mỗi task hoàn tất.*
*Phiên bản: 1.0 — 24/09/2026*
