# 60 — Viết PRD v2 cho bản MVP

## Yêu cầu
"viết vào documentation bản prd thứ 2 mô tả cho bản mvp này và những điểm cần cải tiến"

## Đã làm
- Tạo `docs/documentions/PRD_v2_MVP_edu04.md` gồm các phần:
  - tóm tắt, mục tiêu MVP;
  - bảng phạm vi so với PRD v1, ghi rõ phần nào đã có, có một phần, chưa có;
  - ma trận quyền 4 vai trò;
  - yêu cầu chức năng của MVP, có mã MVP-QA, LA, DOC, QZ, ADM kèm D-xx;
  - kiến trúc và các lựa chọn kỹ thuật;
  - hiện trạng phi chức năng;
  - **20 điểm cần cải tiến** chia 3 nhóm (AI/trích dẫn, sản phẩm/UX, vận hành/bảo mật), mỗi điểm có ưu tiên P1–P3;
  - tiêu chí nghiệm thu, truy vết quyết định.
- PRD v2 không thay thế PRD v1: v1 là yêu cầu đích, v2 là mô tả bản MVP thực tế.
- Chỉ ghi số liệu đã kiểm chứng (27 test, 76 chunk, 15 tài liệu). Kết quả eval chưa chạy được ghi là "chưa có", không bịa số.
- Sửa các dòng lỗi thời trong `mo_ta_du_an_hien_tai.md`: thay dòng `/profile` (đã bỏ, D-62) bằng `/admin/costs`; vai trò admin (D-61); ghi chú trang trích dẫn (D-57); thêm liên kết tới PRD v2.

## Lưu ý
Chỉ sửa tài liệu, không sửa code. Chưa commit.

## Sửa sau bản rà soát (cùng ngày)
Đối chiếu một bản rà soát bên ngoài với mã nguồn; mọi nhận định đều đúng. PRD v2 đã sửa các chỗ sai hoặc thiếu:
- §6: trước ghi "tsc sạch trong src". Thực tế `tsc` báo 4 lỗi ở `.next/types` cũ, vì lúc kiểm mình đã lọc bỏ lỗi `.next` nên báo sạch, sai. `eslint src` báo 24 lỗi / 29 cảnh báo.
- Thêm vào §6: phiên đăng nhập lưu trong bộ nhớ (`SessionStore`), job tài liệu chạy bằng thread nền, endpoint mẫu `/api/v1/chat` vẫn được mount.
- §7:
  - OP-3 trước ghi chung là "SQLite"; thực tế `docker-compose.yml` đã cấu hình PostgreSQL nhưng chưa kiểm chứng.
  - Thêm OP-0 (frontend lint/types), OP-8 (hàng đợi job), OP-9 (hồ sơ Demo Day); OP-4 và OP-7 nâng lên P1.
  - Thêm kết luận hiện trạng và thứ tự triển khai.
- §8: AC-7 ghi rõ frontend chưa đạt; thêm AC-8 (eval + UAT chưa thực hiện).
