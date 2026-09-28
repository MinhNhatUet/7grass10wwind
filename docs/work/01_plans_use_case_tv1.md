# 01 — Tạo kế hoạch code theo use case TV1

- **Ngày:** 25/09/2026
- **Yêu cầu:** tạo thư mục plans, mỗi file md là một use case của TV1 gồm user story, kiến trúc và cấu trúc thư mục chi tiết, làm căn cứ để agent code mà không bịa. Không push.
- **Liên quan:** BL-01, BL-02, BL-03, BL-27, BL-28, BL-30, BL-36, BL-40; PRD 9–14, 16; BR-01/02/03/06/07/09/10/11/12.
- **Kết quả:** hoàn thành (chỉ có tài liệu, chưa có code).

## File tạo/sửa

| File | Thao tác |
|---|---|
| `docs/plans/README.md` | Tạo: mục lục, kiến trúc chung, cây thư mục, quy ước, phụ thuộc, mâu thuẫn tài liệu |
| `docs/plans/UC-01_BL-01_chot_pham_vi.md` … `UC-08_BL-40_nghiem_thu_nang_cao.md` | Tạo 8 file |
| `.gitignore` | Sửa `docs/documentions/rules/` thành `docs/rules/` (người dùng đã chuyển thư mục); thêm `docs/plans/` |
| `docs/rules/coding_agent_rules.md` | Sửa đường dẫn (docs/rules, docs/documentions, docs/work); thêm R-13 "Có plan mới code" |
| `CLAUDE.md` | Thêm hướng dẫn đọc plans cho việc của TV1 |

## Kiểm tra đã chạy

- `git check-ignore -v docs/rules/coding_agent_rules.md docs/plans/README.md`: cả hai đều bị ignore.
- Không chạy ruff/pytest vì không có thay đổi code.

## Việc còn lại / câu hỏi mở

1. Số môn chưa thống nhất: PRD ghi 6, BL-02 ghi 2, dữ liệu hiện có 3.
2. Hai manifest trong `data/raw/` lệch nhau về `usage_permission` và `acl.roles`. Cần chọn manifest chuẩn.
3. `docs/decisions/scope.md` (D-16) mà manifest tham chiếu không còn tồn tại.
4. Cách ánh xạ `document_id`/`version_id` của API sang `source_id` của manifest chưa có hợp đồng (UC-04).
5. RAGAS cần context/trace mà API trong PRD 11.3 chưa trả về (UC-07).
6. Chưa quyết định `docs/decisions/`, `docs/uat/`, `docs/bugs/`, `docs/handover/` có commit hay không.
7. Thư mục `docs/work/` hiện **không** bị ignore. Cần hỏi người dùng có muốn ignore không.
