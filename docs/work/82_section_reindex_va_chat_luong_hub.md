# 82 — Reindex chunk có `section` và kiểm chất lượng Hub (D-76)

## Yêu cầu
Làm 2 việc còn lại sau D-75:
1. Chạy `scripts/reindex_sectioned_chunks.py` để chunk có `section`.
2. Kiểm chất lượng tìm kiếm của Hub mới.

Liên quan FR-04, AI-2, AI-3, AI-4.

## Đã làm
1. **Tạo bộ chunk có section** bằng `scripts/rebuild_mineru_chunks.py`, ghi ra thư mục mới `data/artifacts/chunks_sectioned/` (không ghi đè dữ liệu cũ).
   - Kết quả: 15 tài liệu, **408 chunk**, trong đó 399 có `section`. Bản cũ là 76 chunk lớn.
2. **Dry-run reindex** trên DB thật: khớp đủ 15 tài liệu; embedding Gemini 768 chiều, đúng với DB.
3. **Sao lưu** `data/app.db` → `backup/app_before_section_reindex_2026-10-03.db`. Tạo bản sao thử `data/app_section_trial.db`. **DB thật chưa bị sửa.**
4. **`--apply` trên bản sao thử:**
   - Xong 13/15 tài liệu: 357 chunk đã embedding, 339 chunk có section.
   - Tài liệu 13 và 14 bị `EMBEDDING_RATE_LIMITED`. Script xử lý an toàn: tài liệu vẫn giữ bản cũ đang Published, bản mới chuyển Failed.
   - Nguyên nhân: đã hết **quota embedding Gemini free tier trong ngày** (`EmbedContentRequestsPerDayPerProjectPerModel-FreeTier`, còn khoảng 19 giờ). Lúc đó mình chạy đo song song nên làm job hết quota nhanh hơn.
5. **Kiểm chất lượng Hub** trên DB hiện tại: 14 truy vấn dev, tài liệu mong đợi suy từ tên bài (không phải holdout).

   | Cách xếp | Đúng tài liệu đầu | Đúng trong top 3 |
   |---|---|---|
   | Hub mới, `TokenOverlapReranker` gốc | 9/14 | 12/14 |
   | Hub mới, xếp theo fusion | **14/14** | 14/14 |
   | Retrieval cũ (Academic) | 14/14 | 14/14 |

6. **Sửa reranker (D-76):** xếp theo điểm fusion, phủ từ chỉ để phá hòa (×1e-6).

## Kiểm tra
- `ruff check` + `format --check`: đạt. `pytest`: 112 passed.
- **Chưa** đo lại Hub sau khi sửa, và **chưa** đo trên bộ chunk có section, vì hết quota embedding. Phương án "fusion" đã đo được 14/14 trước khi hết quota.
- **Chưa** kiểm trên giao diện: MCP trình duyệt (chrome-devtools, playwright) không kết nối được trong phiên này.

## Còn lại / rủi ro
- Sau khi quota đặt lại:
  - chạy tiếp `--apply` trên bản sao thử (script tự bỏ qua các tài liệu đã xong);
  - đo lại Hub và Academic trên bản sao thử;
  - chạy UAT trên bản sao thử;
  - nếu tốt hơn thì mới thay DB thật.
- **Hệ quả khi thay DB thật:**
  - phiên bản cũ chuyển Archived, nên trích dẫn trong các hội thoại cũ sẽ bị che, coi như "nguồn đã thu hồi";
  - chunk nhỏ hơn (khoảng 500 token so với khoảng 2.000 ký tự) có thể cần chỉnh lại `retrieval_min_score`;
  - D-73 / D-74 dựa trên nội dung chunk, nên phải chạy lại UAT.
- Trong lúc hết quota, chat trên app thật cũng báo lỗi `EMBEDDING_RATE_LIMITED`.

## Cập nhật: chuyển embedding sang OpenAI (D-77, D-78)
- Người dùng chọn dùng API OpenAI chính hãng. Đã thêm cấu hình `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL`; người dùng tự điền key vào `.env`.
- Viết lại `scripts/backfill_embeddings.py` (bản trên nhánh `viet` bị hỏng).
- **Bản thử có section, dùng OpenAI** (`data/app_section_trial.db`):
  - đủ 15/15 tài liệu, 408 chunk;
  - Hub đúng tài liệu đầu 10/14, Academic 11/14, top-3 14/14;
  - UAT (ngưỡng 0,48): PLAN-01 / PLAN-02 **Fail**. Chunk mới chỉ dài trung bình **324 ký tự** (một mục slide), nên model không chép được câu nguyên văn (D-74 loại hết câu hỏi). → **Chưa áp chunk có section.** Việt cần gộp các mục nhỏ cho đủ 400–800 token (V-1).
- **Chunk cũ + OpenAI:**
  - `-small`: Academic đúng tài liệu đầu 12/14; điểm câu đúng chủ đề và lạc đề chồng lấn nhau.
  - `-large`: Academic 11/14 (top-3 14/14); điểm tách rõ (0,424 so với 0,406) → chọn ngưỡng 0,42.
- **UAT `-large` + 0,42:** 15 / 1 / 22. DOC-05 lỗi 503 do Hub mới phụ thuộc embedding → sửa D-78 (khi embedding lỗi thì chỉ tìm theo từ khóa). Bộ kiểm thử OPS-01 sửa để giả lập lỗi cả `EMBEDDING_API_KEY`. Chạy lại: DOC-05 Pass → tổng tương đương 16 / 0 / 22.
- **Áp lên DB thật:**
  - sao lưu `backup/app_before_openai_embedding_2026-10-03.db`;
  - `.env`: `EMBEDDING_MODEL=text-embedding-3-large`, `RETRIEVAL_MIN_SCORE=0.42` (bản `.env` cũ lưu trong scratchpad);
  - embedding lại 76 chunk. Đo lại trên DB thật cho kết quả khớp với bản thử.
- `pytest`: 112 passed; `ruff check` / `format --check` (src, tests): đạt.
- Người dùng cần **khởi động lại backend**.
- File thử trong `data/`: `app_section_trial.db`, `app_openai_trial.db`, `app_openai_large_trial.db` (gitignore). Có thể xóa khi không cần.
