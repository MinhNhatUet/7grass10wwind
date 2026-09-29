# 12 — Xem nguồn kiểu NotebookLM (UI-06)

- **Ngày:** 26/09/2026
- **Yêu cầu:** "giống notebooklm á", nói về cách hiện nguồn khi bấm trích dẫn.
- **Liên quan:** UI-06, FR-04.4, FR-10.1, FR-10.6, BR-03, BR-10.
- **Kết quả:** hoàn thành (backend thử bằng API; giao diện đã typecheck + build, chưa xem bằng trình duyệt tự động).

## Thay đổi

- **Backend `GET /documents/{id}/versions/{vid}/pages?page_from&page_to`** (bổ sung ngoài bảng PRD 11.2):
  - Trả toàn văn theo trang, tối đa 10 trang mỗi lần. Các chunk cùng trang được ghép lại và bỏ phần chồng lấn.
  - Kiểm tra quyền ở mỗi lần gọi: không có quyền môn/vai trò → 404 (không lộ sự tồn tại, BR-10); có quyền nhưng nguồn đã thu hồi/lưu trữ/khóa → 410.
- **Frontend `SourceReader`:**
  - Bấm [n] → mở toàn văn quanh trang được trích (±1 trang), tự cuộn tới đoạn hỗ trợ được tô sáng.
  - Có nút đọc trang trước/sau. Trang mục lục/chỉ mục đã lọc hiện ghi chú, không hiện trống.
  - Nút "Mở bản gốc" chỉ hiện khi có quyền tải.
- **Chip trích dẫn:** dạng số tròn; rê chuột (hoặc focus bằng bàn phím) hiện thẻ xem nhanh gồm số trang và đoạn trích.
- Xóa `package-lock.json` rỗng ở gốc repo do lệnh `npm` của tôi vô tình tạo ra (chưa được git theo dõi); nó gây cảnh báo "nhiều lockfile" khi build Next.js.

## Kiểm tra (kết quả thật)

- Trang 99–101: trang 100 ghép đủ 2.262 ký tự, có "DEFINITION 5.3.1", không lặp đoạn chồng lấn. Xin 50 trang → chỉ trả 10.
- SV1 đọc bản hiện hành → 200; SV2 khác môn → 404; SV1 đọc bản đã Archived → 410.
- ruff pass; frontend typecheck + build pass.

## Giới hạn

- Thẻ Hub (không có citation) tô sáng theo phần đầu chunk. Nếu chunk đó nằm sau chunk khác cùng trang, phần đầu có thể đã bị cắt khi ghép, nên có thể không tô sáng/cuộn được.
- Hiển thị text đã làm sạch, không hiện ảnh trang PDF gốc; công thức toán vẫn kém như ghi ở log 11.
