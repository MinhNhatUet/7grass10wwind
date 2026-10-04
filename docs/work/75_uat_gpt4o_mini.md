# 75 — Chạy lại UAT với gpt-4o-mini, sửa 4 lỗi P1 (D-72)

## Yêu cầu
"chạy uat"

## Diễn biến

| Lượt | Phạm vi | Pass | Fail | Blocked |
|---|---|---:|---:|---:|
| `UAT_20261003_0906` | toàn bộ, code `8e6bf7e` | 12 | 4 | 22 |
| `0917` | 8 ca sau sửa router và bộ kiểm thử | — | 2 | — |
| `0921` | toàn bộ | 15 | 2 | 21 |
| `0933` | toàn bộ, code cuối | **16** | **0** | **22** |

## Lỗi tìm ra và cách sửa
1. **Router chuyển nhầm sang Hub** (DOC-01, QA-04, QA-06): câu "Theo tài liệu…", "Tài liệu này nói gì…", "Tóm tắt tài liệu…" nhận được danh sách tài liệu thay vì câu trả lời. Đã sửa `ROUTER_SYSTEM`; router đúng 7/7 câu, mỗi câu thử 2 lần.
2. **Model quên gắn [n]** (ACL-03, DOC-01): câu trả lời đúng nhưng không có [n], nên bị FR-10.3 đổi thành "không đủ căn cứ". Đã thêm `academic._restore_citations`; chỉ gắn khi câu trích nguyên văn có thật trong chunk. Tự kiểm 5/5 tình huống.
3. **Dịch sai số liệu** (DOC-03): "fourteen" thành "bốn". `BASE_POLICY` quy tắc 7 thêm yêu cầu giữ đúng số liệu, viết bằng chữ số.
4. **Lộ trình theo ngày không tạo được** (PLAN-01): model trả `feasible=false` với 0 buổi. Prompt lập lộ trình thêm trường `deferred`; server cảnh báo "Chưa đủ thời gian cho…". Tạo được 3/3 lần, trước là 0/3.
5. **Bộ kiểm thử:**
   - AUTH-03 trước so nguyên body (có `request_id` riêng mỗi request), nay so mã HTTP và mã lỗi;
   - QA-04 trước để lọt trường hợp không có trích dẫn, nay bắt buộc phải có trích dẫn từ tài liệu A.

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: đạt. `pytest`: 24 passed.
- Lượt cuối `0933`: 16 Pass / 0 Fail / 22 Blocked; chat p50 6,8 s, p95 13,4 s; chi phí khoảng 0,022 USD.
- Báo cáo: `docs/uat/uat_mvp_report_UAT_20261003.md`.

## Lưu ý
- Các lỗi trên đều xuất phát từ việc model `gpt-4o-mini` kém ổn định hơn. Đã đặt chốt chặn ở server hoặc prompt, nhưng vẫn cần holdout để đo độ chính xác thật.
- Chưa commit.
