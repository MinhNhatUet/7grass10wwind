# 35 — Nguồn tham khảo hiện đúng công thức như sách

**Yêu cầu:** "sửa cả nguồn tham khảo", "tôi muốn nguồn cx đc hiện đẹp như v" (đẹp như công thức KaTeX trong câu trả lời). **Quyết định:** D-41.

## Nguyên nhân
- Đoạn trích nguồn là text lưu lúc trích xuất bằng `pypdf`. Thư viện này đọc sai font toán của TeX:
  - `≥` thành `\x15` rồi bị xoá khi làm sạch;
  - `∪` thành `[`, dấu phẩy thành `;`;
  - dính chữ (`Ifa,b∈ Z andn∈ N`).
- KaTeX không dựng lại được vì text vốn đã mất ký hiệu, và không được để LLM "viết lại" trích dẫn (BR-04).

## Thay đổi
1. **Ảnh đoạn trích**:
   - `page_render.render_snippet()` tìm vị trí trích dẫn trên trang bằng pdfium: cụm 4 từ chữ cái liên tiếp ở đầu và cuối (tìm điểm cuối sau điểm đầu), gom khung ký tự, rồi render đúng vùng đó (lề ngang 8pt, lề dọc 3pt).
   - Endpoint `GET /citations/{id}/snippet`: kiểm tra quyền giống `/source` (owner hội thoại, ACL, bản còn phục vụ → 410); không định vị được thì 404; không phải PDF thì 409.
2. **Frontend** `components/source-snippet.tsx`:
   - tải ảnh có Bearer (`fetchObjectUrl`), hiện khung chờ khi đang tải, lỗi thì hiện chữ như cũ;
   - dùng ở thẻ "Nguồn tham khảo" (chat) và khối Dẫn chứng (thẻ học; `EvidenceSource` thêm `citationId`).
3. **Trích xuất PDF** (`ingestion.extract_pdf`):
   - text lấy bằng `pypdfium2`, trang pdfium lỗi hoặc rỗng thì dùng `pypdf`;
   - `pypdf` vẫn dùng để kiểm tra mã hoá / hỏng / số trang;
   - gạch nối mềm `￾` và mảnh ngoặc `\uf8xx` bị bước làm sạch có sẵn bỏ đi.

## Kiểm tra
- `render_snippet` trên toàn bộ 173 trích dẫn đang có: 171 định vị được, 2 quay về hiện chữ.
- Ảnh Định lý Ore (tr.101) hiện đúng $n \ge 3$, $d(v)+d(w) \le n_1+n_2-2 < n$.
- So sánh trích xuất:
  - sách Tổ hợp tr.101: `n 3, and d( v) + d(w) n` → `n ≥ 3, and d(v) + d(w) ≥ n`;
  - tr.12: `A1 [ [An` → `A1 ∪ · · · ∪An`;
  - Number Theory: `thata is congruent tob modulon` → `a ≡ b (mod n)`.
- ruff sạch; `tsc` sạch; ESLint sạch ở file mới / sửa.
- Edge headless ở cổng 3000 (sinhvien01, hội thoại "chu trình hamilton"): 4/4 nguồn hiện ảnh, cả chế độ sáng và tối.

## Còn mở
- 2 sách COURSE-01 đang phát hành vẫn giữ text trích bằng `pypdf` (ảnh đoạn trích thì đã đúng).
- Muốn text và embedding cũng sạch thì chạy `scripts/reprocess_books.py --course COURSE-01`: tạo version mới, embedding lại khoảng 333 đoạn, trích dẫn của hội thoại cũ hết mở được. Chờ người dùng quyết.

> **Cập nhật:** người dùng chọn hiện CHỮ thay vì ảnh. Phần ảnh đoạn trích (endpoint `/citations/{id}/snippet`, `render_snippet`, `source-snippet.tsx`) đã gỡ; giữ phần trích xuất bằng pdfium. Xem log 36 / D-42.
