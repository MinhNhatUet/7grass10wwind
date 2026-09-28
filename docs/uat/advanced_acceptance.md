# Nghiệm thu nâng cao — checklist Should (BL-40)

Danh sách lấy từ bảng E7 của [backlog](../documentions/backlog_edu04.md) mục 4.7. BL-35 không có ở đây vì đã chuyển sang Must. Mỗi Should **đã cam kết** phải có bằng chứng thật; nếu bỏ thì ghi thay đổi phạm vi kèm người xác nhận (PRD 14.3). Không ghi "đạt nâng cao" khi còn dòng cam kết chưa có bằng chứng.

So sánh số liệu: `python -m eval.benchmark.compare` (điền `run_id` trong `eval/benchmark/configs/*.json`).

| ID | Hạng mục | Owner | Truy vết | Cam kết? | Bằng chứng (PR/run_id/báo cáo) | Trạng thái | Người xác nhận |
|---|---|---|---|---|---|---|---|
| BL-31 | Router LangGraph cho ba trợ lý | TV3 | FR-11, F-11 | Chưa chốt | | Chưa có | |
| BL-32 | Hybrid BM25 + vector + reranker | TV3 | FR-12, UAT-18 | Chưa chốt | | Chưa có | |
| BL-33 | OCR và kiểm tra chất lượng scan | TV3 | FR-07, UAT-12 | Chưa chốt | | Chưa có | |
| BL-34 | Hub tổng hợp nhiều tài liệu | TV3 | FR-04.6, FR-11 | Chưa chốt | | Chưa có | |
| BL-36 | RAGAS và mở rộng bộ kiểm chứng vượt 100 mẫu bắt buộc | TV1 | FR-14, PRD 13.5 | Chưa chốt | | Chưa có | |
| BL-37 | Cache có ACL và revision nguồn/quyền | TV2 | FR-15, BR-10 | Chưa chốt | | Chưa có | |
| BL-38 | Phát hiện và xử lý semantic dedup | TV3 | FR-16 | Chưa chốt | | Chưa có | |
| BL-39 | Dashboard vận hành và ngân sách | TV2 | FR-01.4, NFR-01, PRD 11.2 (`GET /metrics`) | Chưa chốt | | Chưa có | |

## Kiểm soát bắt buộc trên cấu hình advanced

| Điều kiện | Bằng chứng | Kết quả |
|---|---|---|
| Accuracy ≥80/100 (chạy lại trên cấu hình advanced) | | Chưa chạy |
| Không P0/P1 (safety chạy lại) | | Chưa chạy |
| UAT bị ảnh hưởng đã chạy lại | | Chưa chạy |
| RAGAS báo riêng, ngưỡng đã được xác nhận trước khi chạy | | Chưa chạy |
| Trade-off chất lượng/độ trễ/chi phí và giới hạn | | Chưa có |
