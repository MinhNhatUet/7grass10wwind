# 18 — Embedding ngay khi tải sách lên (D-34)

- **Ngày:** 26/09/2026
- **Yêu cầu:** "tôi muốn khi ai tải sách lên thì nó tự động embedding như thế dễ dàng để llm đọc và check".
- **Liên quan:** FR-07, FR-08, BR-01; PRD 9.2 ("các chỉ mục tạm trước duyệt không tham gia tìm kiếm công khai"); pipeline PRD `Upload → Job → Parse → Chunk → Embedding → Index`.
- **Kết quả:** hoàn thành. Đã thử luồng bằng embedding giả trên bản sao DB, vì hôm nay đã hết quota Gemini. Giao diện đã build, chưa xem bằng trình duyệt.

## Thay đổi

- **`documents._run_extract`:** trích xuất xong thì xếp job `embed`. `_run_job` tự khởi động job này chạy nền.
- **`_embed_missing()`:** vòng embedding theo lô, dùng chung cho job `embed` (trước duyệt) và `index` (sau duyệt). Chỉ embedding chunk chưa có vector.
- **`_run_embed`:**
  - chỉ chạy khi bản ở Draft / NeedsReview / PendingApproval;
  - tự dừng nếu bản chuyển sang Approved hoặc Indexing, để job index làm tiếp;
  - khi lỗi (vd. 429) chỉ đánh dấu job failed, **không** đổi trạng thái bản và không chặn luồng duyệt.
- **`config.embed_on_upload`** (env `EMBED_ON_UPLOAD`, mặc định `true`) để tắt khi cần tiết kiệm quota.
- **`GET /manage/versions`:** trả thêm `chunk_count` và `embedded_count`. UI-07 hiện "Embedding x/y đoạn" hoặc "✓ Đã embedding xong — duyệt là phát hành ngay".
- **Không đổi ranh giới an toàn:** retrieval (`servable_versions`) vẫn chỉ lấy bản Published hiện hành, nên chỉ mục tạm không lộ ra Hub hay chat (BR-01).

## Kiểm tra (bản sao DB, embedding giả 768 chiều)

| Ca | Sau upload | Có trong tập tìm kiếm trước duyệt? | Sau duyệt |
|---|---|---|---|
| Embedding thành công | Draft, job embed succeeded, 199/199 | Không | Published sau 3,0 giây, **không embedding thêm đoạn nào** |
| Embedding lỗi 429 | Draft, job embed failed `EMBEDDING_RateLimitError`, 0/245 | Không | Published sau 3,0 giây, job index embedding bù 245 đoạn |

- ruff pass; pytest 5 passed; `npm run build` pass.
- **Sự cố khi test (đã khắc phục):** kho file lưu theo checksum nội dung. Bước dọn file của script test đã xóa nhầm file gốc của *Introduction to Theory of Computation*, vì file test trùng nội dung với sách thật. Tôi đã ghi lại file từ `data/raw` (khóa và checksum khớp) và kiểm tra lại: mọi phiên bản trong DB đều còn file. Bài học: script test không được xóa file trong `data/storage` theo khóa.

## Giới hạn

- Tài liệu bị từ chối vẫn đã tốn quota embedding (free tier chỉ có 1.000 request/ngày).
- Người duyệt chưa thể hỏi LLM về bản nháp trước khi duyệt. Chỉ mục tạm đã sẵn sàng cho việc này nếu sau muốn làm, nhưng cần quyết định riêng vì liên quan BR-01 và FR-08.
