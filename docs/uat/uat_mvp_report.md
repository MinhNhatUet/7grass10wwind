# Báo cáo thực thi UAT MVP — EDU-04

Bộ ca: [uat_mvp.md](uat_mvp.md), phiên bản 1.0, ngày 2026-10-02.

> ⚠️ **ĐÂY LÀ MẪU BÁO CÁO, không phải trạng thái dự án.** Mỗi lượt chạy sao file này thành `uat_mvp_report_<run_id>.md` rồi điền vào bản sao. Kết quả các lượt đã chạy: [uat_mvp.md — Kết quả các lượt chạy](uat_mvp.md#kết-quả-các-lượt-chạy).

**Trạng thái của bản mẫu: để trống.** Không ghi kết quả Pass hoặc kết luận nghiệm thu vào file này.

## 1. Thông tin lượt chạy

| Trường | Giá trị |
|---|---|
| Run ID | Chưa điền |
| Ngày bắt đầu / kết thúc, timezone | Chưa điền |
| Commit SHA / thay đổi chưa commit | Chưa điền |
| Phiên bản bộ UAT / PRD | UAT MVP 1.0 / PRD v2 |
| URL frontend / backend | Chưa điền |
| DB engine / phiên bản dữ liệu fixture | Chưa điền |
| Model LLM / embedding, cấu hình retrieval | Chưa điền |
| Quota / upload limit / timeout / bảng giá và tỷ giá | Chưa điền, không ghi secret |
| Trình duyệt / hệ điều hành / viewport | Chưa điền |
| Người đại diện SV / GV / RV / AD | Chưa điền |
| Kỹ thuật viên / chủ trì nghiệm thu | Chưa điền |
| Xác nhận phạm vi và điều kiện đạt trước khi chạy | Chưa xác nhận |
| Kho bằng chứng được phép lưu | Chưa điền |

Mỗi lượt chạy sao chép mẫu này sang tệp theo run_id hoặc giữ lịch sử lượt chạy rõ ràng. Không ghi đè Fail của lượt trước bằng Pass của lượt sau mà mất liên kết bug/retest.

## 2. Kiểm tra sẵn sàng

| Điều kiện | Trạng thái | Bằng chứng / người xác nhận |
|---|---|---|
| Môi trường UAT riêng; DB/file có thể khôi phục | Chưa kiểm tra | |
| Health / ready / frontend truy cập đúng backend | Chưa kiểm tra | |
| Tài khoản và quyền đủ, phiên vai trò tách biệt | Chưa kiểm tra | |
| Fixture và đáp án chuẩn được GV duyệt | Chưa kiểm tra | |
| Nguồn có quyền sử dụng phù hợp | Chưa kiểm tra | |
| Provider/quota và cơ chế giả lập lỗi sẵn sàng | Chưa kiểm tra | |
| Lint/test/typecheck/build của bản kiểm thử có log | Chưa kiểm tra | |
| Điểm chặn/giới hạn đã biết được ghi nhận | Chưa kiểm tra | |

## 3. Tổng hợp

| Phạm vi | Tổng | Chưa chạy | Pass | Fail | Blocked | N/A |
|---|---:|---:|---:|---:|---:|---:|
| Chức năng bắt buộc | 37 | 37 | 0 | 0 | 0 | 0 |
| Cổng AI/an toàn | 1 | 1 | 0 | 0 | 0 | 0 |
| Toàn bộ | 38 | 38 | 0 | 0 | 0 | 0 |

Sau khi chạy, tổng trạng thái phải bằng tổng ca. Báo tỷ lệ Pass trên **toàn bộ phạm vi đã chốt**, không chỉ trên số ca đã chạy; trình bày riêng Blocked/N/A. Số liệu ban đầu trên đây chỉ biểu thị chưa thực hiện.

## 4. Kết quả từng ca

| Mã | Kịch bản | Trạng thái | Thực tế / biến thể | Bằng chứng | Bug | Người chạy / thời điểm |
|---|---|---|---|---|---|---|
| MVP-AUTH-01 | Đăng nhập và điều hướng theo vai trò | Chưa chạy | | | | |
| MVP-AUTH-02 | Đăng ký không tự cấp quyền | Chưa chạy | | | | |
| MVP-AUTH-03 | Sai mật khẩu và giới hạn đăng nhập | Chưa chạy | | | | |
| MVP-ACL-01 | Cách ly tài liệu và dữ liệu cá nhân | Chưa chạy | | | | |
| MVP-ACL-02 | Admin không đọc nội dung học tập | Chưa chạy | | | | |
| MVP-QA-01 | Hỏi đáp và kiểm chứng trích dẫn | Chưa chạy | | | | |
| MVP-QA-02 | Không đủ nguồn và làm rõ yêu cầu | Chưa chạy | | | | |
| MVP-QA-03 | Giải thích lại và công thức | Chưa chạy | | | | |
| MVP-QA-04 | Thư viện và hỏi riêng tài liệu | Chưa chạy | | | | |
| MVP-QA-05 | Liêm chính học thuật nhiều lượt | Chưa chạy | | | | |
| MVP-QA-06 | Chỉ thị trong tài liệu không thành lệnh | Chưa chạy | | | | |
| MVP-LA-01 | Trắc nghiệm ôn tập và nguồn từng câu | Chưa chạy | | | | |
| MVP-LA-02 | Flashcard và điền khuyết | Chưa chạy | | | | |
| MVP-LA-03 | Tự luận, chẩn đoán và ôn cấp tốc | Chưa chạy | | | | |
| MVP-PLAN-01 | Tạo, sửa và lưu lộ trình | Chưa chạy | | | | |
| MVP-PLAN-02 | Tiến độ, ôn theo buổi và xóa | Chưa chạy | | | | |
| MVP-PLAN-03 | Xuất lịch | Chưa chạy | | | | |
| MVP-DOC-01 | Tải lên, gửi duyệt, phát hành | Chưa chạy | | | | |
| MVP-DOC-02 | Từ chối và chống tự duyệt | Chưa chạy | | | | |
| MVP-DOC-03 | Phiên bản và quyết định cũ | Chưa chạy | | | | |
| MVP-DOC-04 | PDF scan, file hỏng và vượt giới hạn | Chưa chạy | | | | |
| MVP-DOC-05 | Embedding lỗi và retry | Chưa chạy | | | | |
| MVP-ACL-03 | Thu hồi, khóa khẩn cấp và nguồn cũ | Chưa chạy | | | | |
| MVP-ACL-04 | Đổi quyền khi đang trả lời và khóa tài khoản | Chưa chạy | | | | |
| MVP-QZ-01 | Soạn đề và kiểm tra trước phát hành | Chưa chạy | | | | |
| MVP-QZ-02 | Tạo đề từ PDF có và không có đáp án | Chưa chạy | | | | |
| MVP-QZ-03 | Giới hạn và lỗi tạo đề PDF | Chưa chạy | | | | |
| MVP-QZ-04 | Làm đề luyện tập và chấm chính xác | Chưa chạy | | | | |
| MVP-QZ-05 | Đề thi không lộ đáp án, không thi lại | Chưa chạy | | | | |
| MVP-QZ-06 | Thời gian server và đóng đề | Chưa chạy | | | | |
| MVP-ADM-01 | Quản lý người dùng, môn và audit | Chưa chạy | | | | |
| MVP-ADM-02 | Giám sát và đối soát chi phí | Chưa chạy | | | | |
| MVP-ADM-03 | Quota thực tế và trang xem thử | Chưa chạy | | | | |
| MVP-OPS-01 | Provider lỗi và khôi phục | Chưa chạy | | | | |
| MVP-OPS-02 | Restart và dữ liệu đã lưu | Chưa chạy | | | | |
| MVP-UX-01 | Luồng chính trên desktop và mobile | Chưa chạy | | | | |
| MVP-DATA-01 | Nguồn demo và nhập chunk artifacts | Chưa chạy | | | | |
| MVP-GATE-01 | Đánh giá AI và an toàn chính thức | Chưa chạy | | | | |

## 5. Phiếu thực thi chi tiết — sao chép cho từng ca

- Run ID / mã ca / lần chạy:
- Người chạy / người đối chiếu kiến thức:
- Thời điểm và timezone:
- Tài khoản bí danh, ID đối tượng UAT:
- Điều kiện chuẩn bị thực tế:
- Input/prompt, fixture và phiên bản:
- Kết quả từng bước/biến thể:
- Kết quả mong đợi so với thực tế:
- Mã HTTP / mã lỗi / request_id (nếu có):
- Bằng chứng đã che bí mật:
- Trạng thái: Chưa chạy / Pass / Fail / Blocked / N/A.
- Bug / lý do Blocked / quyết định N/A:
- Cấu hình/quyền đã khôi phục:
- Người kiểm tra lại:

## 6. Nhật ký lỗi và kiểm tra lại

| Bug ID | Ca / biến thể | Mức | Mô tả thực tế | Owner | Hạn xử lý | Trạng thái | Build sửa / retest / bằng chứng |
|---|---|---|---|---|---|---|---|
| Chưa ghi nhận trong lượt UAT này | | | | | | | |

“Chưa ghi nhận” không có nghĩa “không có lỗi”; bộ UAT chưa được chạy.

### Mẫu bug

- ID: UAT-BUG-<run_id>-<số>.
- Tiêu đề ngắn / mức P0…P3 / ca liên quan:
- Môi trường, commit và tài khoản bí danh:
- Tiền điều kiện, fixture/ID:
- Các bước tái hiện đánh số:
- Kết quả mong đợi:
- Kết quả thực tế:
- Tần suất (số lần lỗi/tổng lần thử):
- Ảnh/log/request_id đã che bí mật:
- Ảnh hưởng người dùng:
- Owner / trạng thái / hạn:
- Build sửa:
- Lượt chạy lại, kết quả và bằng chứng:

## 7. Bằng chứng đánh giá AI và kỹ thuật

| Hạng mục | Kết quả | Run ID / log / người kiểm tra |
|---|---|---|
| QA-01: đối chiếu 10 câu | Chưa chạy | |
| Accuracy holdout 100 mẫu | Chưa chạy | |
| Safety ≥40 ca | Chưa chạy | |
| Ruff | Chưa chạy trên build nghiệm thu | |
| Pytest | Chưa chạy trên build nghiệm thu | |
| Frontend lint | Chưa chạy trên build nghiệm thu | |
| Typecheck | Chưa chạy trên build nghiệm thu | |
| Build frontend | Chưa chạy trên build nghiệm thu | |
| Quyền dùng nguồn / dữ liệu | Chưa xác nhận | |

Không sao chép số liệu rà soát cũ vào đây như kết quả của build nghiệm thu mới.

## 8. Giới hạn, thay đổi phạm vi và kết luận

| Nội dung | Ảnh hưởng | Cách xử lý / hạn | Người chấp nhận / ngày |
|---|---|---|---|
| Chưa điền; đối chiếu giới hạn trong bộ ca trước khi chạy | | | |

- Kết luận hiện tại: **Chưa đủ bằng chứng nghiệm thu — chưa chạy UAT.**
- Sau thực thi chọn: Đạt / Không đạt / Chưa thể kết luận.
- Lý do, lỗi còn mở, Blocked/N/A và điều kiện còn thiếu:
- Danh sách ca cần chạy lại:
- Liên kết [release gate](release_gate.md); không tự kết luận cho phép production từ một lượt smoke test.

| Vai trò xác nhận | Họ tên | Ngày | Ý kiến / chữ ký |
|---|---|---|---|
| Đại diện sinh viên | | | |
| Giảng viên kiểm chứng chuyên môn | | | |
| Kỹ thuật phụ trách | | | |
| Chủ trì nghiệm thu | | | |

