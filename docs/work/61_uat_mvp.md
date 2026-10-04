# 61 — Bộ UAT cho MVP hiện tại

## Yêu cầu

Viết UAT sau khi rà soát tổng quan dự án.

## Đã làm

- Tạo `docs/uat/uat_mvp.md`: chuẩn bị môi trường/tài khoản/fixture, 38 ca có bước thao tác và kỳ vọng, truy vết PRD v2 và UAT v1, bằng chứng, điều kiện kết luận và phân loại lỗi.
- Tạo `docs/uat/uat_mvp_report.md`: mẫu báo cáo đồng bộ 38 ca, phiếu thực thi, bug/retest và ký xác nhận.
- Giữ bộ UAT v1; thêm liên kết bộ MVP ở checklist/report gốc và release gate.
- Phân biệt rõ phạm vi có thật với quota xem thử, lịch một chiều, OCR chưa có; kiểm tra đúng quy tắc thi nộp muộn và phiên mất khi restart.
- Chưa tạo fixture, chưa chạy UI/API/AI, chưa ghi ca nào Pass. Tài liệu không thay kết quả nghiệm thu.
- Chỉ sửa tài liệu. Kiểm tra mã ca, số lượng, liên kết và diff; không chạy lại test ứng dụng cho thay đổi tài liệu.

