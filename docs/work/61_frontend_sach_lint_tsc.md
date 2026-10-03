# 61 — Frontend sạch build / tsc / lint (bước 1–2 của bản rà soát)

## Yêu cầu
"làm 1 2 đi", tức bước 1 (dựng lại route types, kiểm tra build) và bước 2 (sửa lint) trong đề xuất sau bản rà soát.

## Trước khi sửa
- `tsc` báo 4 lỗi trong `.next/types/validator.ts`. Đây là route types do Next.js sinh tự động từ lần build trước, vẫn trỏ tới `app/dashboard`, `app/hub/manage`, `app/hub/review`, `app/profile`, là các trang đã chuyển hoặc xoá (D-59, D-62).
- `npm run lint`: 25 lỗi / 29 cảnh báo (24 lỗi trong `src`, 1 lỗi ở `transform.js`).

## Đã làm
1. **Route types:** chạy `npm run build` để sinh lại `.next/types`; build thành công, 19 route. Dev server đang chạy ở cổng 3000 dùng `.next/dev` nên không bị ảnh hưởng và không bị dừng.
2. **Sửa lint (24 lỗi trong `src`):**
   - `no-explicit-any` (8 lỗi):
     - `(main)/page.tsx`: gộp 2 đoạn map citation giống nhau thành `toSource(c: Citation)`, dùng kiểu `ChatMessage` của `lib/api`. Bỏ nhánh dự phòng `locator_value` vì backend luôn trả `locator.value` / `locator.end` / `document_title`.
     - `lib/api.ts`: thêm `Locator.end?` và `Citation.document_title?`, đúng với dữ liệu backend trả.
     - `hub/page.tsx`, `login/page.tsx`, `lecturer-dashboard.tsx`: thay `any` bằng kiểu cụ thể.
   - `no-unescaped-entities` (2 lỗi): dùng ngoặc kép “ ” trong `lecturer-dashboard.tsx`.
   - `set-state-in-effect` (14 lỗi): đều là effect tải dữ liệu (setState sau `await`), reset state khi đổi trang/nguồn, hoặc cờ `mounted` sau hydrate. Mình thêm `eslint-disable-next-line` kèm lý do, giống cách đã dùng sẵn trong repo (`quiz-builder.tsx`, `source-reader.tsx`), không đổi logic.
3. **`transform.js`:** script Node CommonJS rời của TV4, đang chờ TV4 xác nhận xoá. Mình không sửa file mà thêm nó vào `globalIgnores` của `eslint.config.mjs`.

## Kết quả
- `npm run build`: thành công.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 lỗi, 29 cảnh báo (biến không dùng, `window.location` thay vì router, `<img>`…).
- Backend không đổi.

## Lưu ý
- Chưa đưa lint/build frontend vào CI (OP-0 trong PRD v2).
- PRD v2 §6, OP-0, AC-7 đã cập nhật theo kết quả này.
- Chưa commit.
