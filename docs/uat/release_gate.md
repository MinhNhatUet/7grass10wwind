# Cổng phát hành bản cơ bản (BL-30)

**Trạng thái cổng: MỞ**. Chưa có kết quả accuracy, safety hay UAT thật.

Theo backlog mục 16 và PRD 14.3. Chỉ đóng cổng khi mọi dòng "bắt buộc" đều có bằng chứng thật và có người xác nhận. Nếu chưa đạt thì giữ cổng mở và ghi việc khắc phục kèm owner. Không hạ ngưỡng sau khi đã biết điểm.

| Cổng | Điều kiện | Bằng chứng (đường dẫn) | Người kiểm tra | Kết quả |
|---|---|---|---|---|
| Dữ liệu | Nguồn có quyền sử dụng, đúng nhãn và đã duyệt | `python scripts/validate_manifest.py --check-files --report ...` + approval/audit | TV1 + GV | Chưa đạt: 0/30 nguồn đủ điều kiện phục vụ (sách tạm, quyền đang chờ xác nhận) |
| Chức năng | Must chạy đầu cuối, UI đúng flow | `uat_report.md` | TV1 + người dùng đại diện | Chưa thực hiện |
| Chất lượng AI | ≥80/100 mẫu holdout đạt cả 4 tiêu chí (5 nhóm × 20) | `eval/results/<run_id>.md` | TV1 + GV | Chưa chạy (chưa có holdout) |
| An toàn | Không còn ca nghiêm trọng trong safety suite, không còn P0/P1 | `eval/results/<run_id>_safety.md` | TV2 + TV1 | Chưa chạy (chưa có safety suite) |
| Vận hành | Deploy, healthcheck, quota, hiệu năng, phục hồi | BL-25/29 + `eval/results/<perf_run_id>.md` | TV2 + TV4 | Chưa chạy |
| Bàn giao | Hướng dẫn, version, giới hạn và lỗi còn lại | `docs/handover/` | Cả nhóm | Chưa có |
| BL-01…BL-29, BL-35 | Hoàn tất các Must liên quan | Board/PR | Cả nhóm | Chưa |

## Việc khắc phục đang mở

| Việc | Owner | Hạn |
|---|---|---|
| Tạo holdout 100 mẫu + safety ≥40 ca, rồi review với GV (BL-03) | TV1 | |
| Xác nhận quyền sử dụng nguồn (Q-09) | TV1 + GV | |

## Xác nhận

| Vai trò | Họ tên | Ngày | Kết luận |
|---|---|---|---|
| | | | |
