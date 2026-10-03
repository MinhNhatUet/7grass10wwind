# Cổng phát hành bản cơ bản (BL-30)

> UAT cho phạm vi MVP hiện tại: [bộ kịch bản và kết quả các lượt](uat_mvp.md), [mẫu báo cáo](uat_mvp_report.md). Phạm vi dữ liệu hiện tại: **chỉ môn SE101** (15 bộ slide, D-47/D-48). Chạy UAT tự động không đóng cổng và không thay cho việc xác nhận quyền sử dụng nguồn.

**Trạng thái cổng: MỞ** (cập nhật 2026-10-03). UAT tự động mức API đã chạy, lượt mới nhất 16 Pass / 0 Fail / 22 Blocked. Chưa có kết quả accuracy/safety trên holdout, chưa có người nghiệm thu.

Theo backlog mục 16 và PRD 14.3. Chỉ đóng cổng khi mọi dòng "bắt buộc" đều có bằng chứng thật và có người xác nhận. Nếu chưa đạt thì giữ cổng mở và ghi việc khắc phục kèm owner. Không hạ ngưỡng sau khi đã biết điểm.

| Cổng | Điều kiện | Bằng chứng (đường dẫn) | Người kiểm tra | Kết quả |
|---|---|---|---|---|
| Dữ liệu | Nguồn có quyền sử dụng, đúng nhãn và đã duyệt | `python scripts/validate_manifest.py --check-files --report ...` + approval/audit | TV1 + GV | Chưa đạt. SE101: 15 tài liệu đã qua luồng duyệt → Published, nhưng metadata quyền sử dụng là `unknown` (seed bằng cờ `--confirm-demo-usage`, có audit); chưa có GV/chủ sở hữu xác nhận quyền (Q-09). UAT DATA-01 Blocked vì lý do này. Bộ sách tạm 30 nguồn cũ đã gỡ |
| Chức năng | Must chạy đầu cuối, UI đúng flow | [uat_mvp.md](uat_mvp.md#kết-quả-các-lượt-chạy), `uat_mvp_report_UAT_*.md` | TV1 + người dùng đại diện | Chưa đạt. Tự động mức API: 16 Pass / 0 Fail / 22 Blocked; phần UI và GV chấm chưa làm |
| Chất lượng AI | ≥80/100 mẫu holdout đạt cả 4 tiêu chí (5 nhóm × 20) | `eval/results/<run_id>.md` | TV1 + GV | Chưa chạy (chưa có holdout) |
| An toàn | Không còn ca nghiêm trọng trong safety suite, không còn P0/P1 | `eval/results/<run_id>_safety.md` | TV2 + TV1 | Chưa chạy (chưa có safety suite) |
| Vận hành | Deploy, healthcheck, quota, hiệu năng, phục hồi | BL-25/29 + [eval/results/report.md](../../eval/results/report.md) | TV2 + TV4 | Chưa đạt. Healthcheck và quota có trong UAT. Độ trễ chat p50 6,8 s / p95 13,4 s, chưa đạt mục tiêu < 3 s. Docker compose (Postgres) chưa kiểm chứng |
| Bàn giao | Hướng dẫn, version, giới hạn và lỗi còn lại | [huong_dan_chay.md](../handover/huong_dan_chay.md), [PRD v2](../documentions/PRD_v2_MVP_edu04.md) | Cả nhóm | Có bản nháp, chưa có người xác nhận |
| BL-01…BL-29, BL-35 | Hoàn tất các Must liên quan | Board/PR | Cả nhóm | Chưa |

## Việc khắc phục đang mở

| Việc | Owner | Hạn |
|---|---|---|
| Tạo holdout 100 mẫu + safety ≥40 ca, rồi review với GV (BL-03) | TV1 | |
| Xác nhận quyền sử dụng nguồn SE101 (Q-09) | TV1 + GV | |
| GV chấm nội dung và chạy phần UI cho 22 ca UAT Blocked | TV1 + GV + TV4 | |

## Xác nhận

| Vai trò | Họ tên | Ngày | Kết luận |
|---|---|---|---|
| | | | |
