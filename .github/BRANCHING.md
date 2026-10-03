# Quy ước nhánh — EDU-04

## Luồng làm việc

`main` là nhánh bàn giao ổn định. `develop` là nhánh tích hợp đề xuất; việc tồn tại nhánh này trên remote cần xác minh. Tạo nhánh công việc từ nhánh tích hợp đang được nhóm thống nhất, mở PR về nhánh đó; khi đạt cổng nghiệm thu thì mở PR phát hành về `main`.

Tên nhánh gắn backlog: `feat/BL-16-knowledge-hub`, `fix/BL-06-course-access`, `docs/BL-01-project-scope`. Không làm trực tiếp trên `main` khi triển khai quy trình nhóm. Những thay đổi đang có trong working tree phải được phân loại trước khi commit, không dùng `git add .` để gom cả thay đổi ngoài công việc.

## Issue và pull request

- Một issue có mục tiêu, BL/FR/flow, owner, AC, phụ thuộc và bằng chứng; dùng template trong `.github/ISSUE_TEMPLATE`.
- Một PR tập trung vào một thay đổi có thể review. Mô tả hành vi trước/sau, issue liên quan, validation, migration/config nếu có và giới hạn còn lại.
- Đề xuất ít nhất một thành viên khác review, CI đạt và hội thoại review đã xử lý trước merge. Đây là quy trình đề xuất; chỉ GitHub ruleset/branch protection được cấu hình mới thực thi điều kiện này trên server.
- Không tự đánh dấu Done vì đã mở PR: cần tích hợp, kiểm tra AC và bằng chứng theo backlog.
- PR chạm `docs/guide/` hoặc quy định template phải tuân thủ owner/chính sách repository hiện hành. `CODEOWNERS` hiện có tham chiếu team template cần đối chiếu quyền thật; không tự thay team bằng tên giả.

## Mốc dự án

- Cuối tuần 3: bản cơ bản đã qua accuracy/safety/UAT và có demo.
- Cuối tuần 6: bàn giao cuối theo phạm vi thực tế đã xác nhận.
- Không push bí mật, `.env`, nguồn không được phép, hội thoại riêng hoặc dữ liệu holdout nhạy cảm vào repo công khai. Dataset hạn chế lưu ở nơi được cấp quyền, repo chỉ chứa manifest/schema/checksum phù hợp.

## Thiết lập trên GitHub cần người có quyền thực hiện

Kiểm tra nhánh mặc định, quyền 4 thành viên, nhánh `develop`, ruleset cho nhánh quan trọng, trạng thái CI thực tế, owner review hợp lệ và visibility repository. Không xóa/bỏ qua ruleset của tổ chức để ép merge. Checklist trạng thái và giới hạn kiểm chứng nằm trong [milestone_01_edu04.md](../docs/documentions/milestone_01_edu04.md).
