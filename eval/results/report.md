# Evaluation Report — EDU-04

> Chỉ ghi kết quả đã đo thật. Cập nhật: 2026-10-02.

## 1. Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Response accuracy (holdout 100 mẫu, PRD v1 §13) | ≥ 80% | **Chưa đo**: chưa có holdout/safety do GV soạn và duyệt (`data/eval/` chưa tồn tại, BR-12) | ⏳ Blocked |
| Cơ chế trích dẫn (UAT QA-01, 3 câu mẫu) | Mọi [n] mở được nguồn, đúng trang | 40/40 tiêu chí máy kiểm đạt. **Không phải** độ chính xác nội dung | ✅ (cơ chế) |
| Response latency, chat (sau D-64) | < 3 s | p50 **5,7 s** · p95 **15,1 s** (n=10, lượt `UAT_20261002_1523`). Trước D-64: p95 130 s do không có timeout LLM | ❌ chưa đạt |
| User satisfaction | > 4/5 | Chưa khảo sát | ⏳ |
| Test coverage | > 60% | Chưa đo coverage; `pytest`: 24 passed | ⏳ |
| UAT MVP (38 ca) | 37 ca bắt buộc Pass | **16 Pass · 0 Fail · 22 Blocked** | ⏳ chưa kết luận |
| Chi phí LLM của lượt UAT | — | 56 lượt, ≈ 0,041 USD (≈ 1.070₫), theo bảng giá ước tính (D-60) | ℹ️ |

## 2. Test Results

### Unit tests
```
pytest tests/ -q
24 passed
```

### Kiểm thử chấp nhận tự động mức API
- Bộ chạy: `python -m eval.uat.run_uat_mvp`. Mỗi lượt dùng bản sao DB và backend riêng ở cổng 8100.
- Báo cáo đầy đủ: [docs/uat/uat_mvp_report_UAT_20261002.md](../../docs/uat/uat_mvp_report_UAT_20261002.md).
- Bằng chứng: `data/uat_runs/<run_id>/` (không commit).
- Kết quả theo nhóm:
  - **Đạt:** phân quyền và cách ly dữ liệu (ACL-01/03), admin không đọc nội dung (ACL-02, phần API), thu hồi và khóa khẩn cấp, luồng duyệt tài liệu (DOC-01…05), luồng đề → làm bài → chấm (QZ-01, 03…06), chống prompt injection (QA-06), quota, audit.
  - **Lỗi đã sửa trong lượt:** đề PDF không có đáp án bị AI tự điền đáp án sai (P1); LLM không có timeout (P1); `page_map` lệch 16 trang ở 1 chunk (P1, đã sửa dữ liệu).

## 3. User Feedback

Chưa có lượt nghiệm thu với người dùng thật.

## 4. Demo Results

Chưa demo.

## 5. Action Items

- [ ] GV soạn và khóa holdout 100 mẫu, safety ≥ 40 ca → chạy `eval/runner` (GATE-01)
- [ ] GV chấm các output đã lưu của QA-01/05, LA-01…03, PLAN-01/02, QZ-02; soạn F-QA 10 câu
- [x] Sửa `page_map` chunk sai trang (UAT-BUG-20261002-03)
- [ ] Chạy phần giao diện của UAT (9 ca) và UX-01 trên trình duyệt
- [ ] Giảm độ trễ (mục tiêu < 3 s): stream câu trả lời, gộp bước router
- [x] Log có request ID để truy vết lỗi provider (đợt logging 1, D-65)
