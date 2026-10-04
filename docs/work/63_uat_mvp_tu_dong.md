# 63 — Chạy UAT MVP tự động mức API, sửa 2 lỗi P1, công bố kết quả eval

## Yêu cầu
"Chứng minh MVP hoạt động đúng: chạy UAT theo vai trò; kiểm thử thu hồi quyền/tài liệu, trích dẫn và luồng tạo đề–làm bài; công bố kết quả eval." Thứ tự đã thống nhất: chạy xong UAT → sửa P1 → chạy lại → báo cáo → logging đợt 1.

## Đã làm
1. **Bộ chạy `eval/uat/`**:
   - `fixtures.py`: PDF có lớp chữ dựng bằng tay (ASCII, Helvetica) với khái niệm hư cấu dễ kiểm chứng; PDF scan (PIL); file hỏng.
   - `run_uat_mvp.py`: 38 ca theo `docs/uat/uat_mvp.md`.
     - Mỗi lượt sao DB bằng SQLite backup API, chạy backend riêng ở cổng 8100 và tạo 4 tài khoản UAT.
     - Các ca cần đổi cấu hình (quota, LLM/embedding lỗi, restart) thì khởi động lại backend với cấu hình tương ứng.
     - Ca nào còn tiêu chí cần GV hoặc cần quan sát UI thì để **Blocked**, không tự chấm Pass.
     - Bằng chứng lưu ở `data/uat_runs/<run_id>/` (gitignore). Không ghi token hay mật khẩu; mật khẩu tài khoản UAT sinh ngẫu nhiên, chỉ giữ trong bộ nhớ.
2. **Lượt `UAT_20261002_1501`**: 10 Pass / 10 Fail / 18 Blocked. Phân tích từng Fail:
   - **Lỗi sản phẩm:** QZ-02 (AI tự điền đáp án cho đề không có đáp án); DOC-05 / chat treo do LLM không có timeout; DATA-01 (`page_map` sai trang ở 2 chunk).
   - **Lỗi provider tạm thời:** DOC-03.
   - **Lỗi bộ kiểm thử:** QA-04, QA-05, DOC-02, QZ-04, QZ-05, ACL-03. Đã sửa bộ chạy và ghi rõ trong báo cáo.
3. **Sửa D-64** (`course_quiz.py`, `llm.py`, `config.py`), tự kiểm 8 tình huống của `_keep_answers`.
4. **Chạy lại** (`1523`, `1529`, `1530`). Kết quả cuối: **16 Pass / 1 Fail (DATA-01, P1 dữ liệu còn mở) / 21 Blocked**.
5. **Công bố**:
   - `docs/uat/uat_mvp_report_UAT_20261002.md`: bản báo cáo theo run_id, giữ nguyên file mẫu.
   - `eval/results/report.md`: số liệu thật. Accuracy ghi **chưa đo** vì chưa có holdout; latency, UAT và chi phí lấy từ số đo.

## Kiểm tra
- `ruff check src tests eval/uat`, `ruff format --check src tests`: đạt. `pytest`: 24 passed.
- Chi phí LLM của toàn bộ các lượt UAT ≈ 0,041 USD.

## Sửa dữ liệu `page_map` (UAT-BUG-03, người dùng đồng ý)
- Sao lưu `backup/app_before_pagemap_fix_2026-10-02.db` (SQLite backup API).
- Chỉ 1 chunk lỗi thật: `chk_f150eab1daca26ca` (07_NguyenLyThietKe), `page_map` 27–32 → 11–16 (cả 6 đoạn khớp 100% với trang − 16); `locator_value` 27 → 11. Sửa kèm 1 citation (27 → 11) và 2 trang dẫn chứng trong payload tin nhắn. Không embedding lại.
- `chk_d90341696fe84007` là báo nhầm (chữ trong ảnh slide); bộ phát hiện DATA-01 siết lên ≥ 80%.
- Retest `UAT_20261002_1539`: 520/520 đoạn đúng trang → DATA-01 Blocked (chờ GV xác nhận quyền nguồn). Tổng: 16 Pass / 0 Fail / 22 Blocked.

## Còn mở
- 22 ca Blocked cần GV / UI / dataset / cơ chế giả lập.
- Logging đợt 1: xem `docs/work/64_logging_dot_1.md` (D-65).
- Các file `docs/uat/*` khác (uat_mvp.md, mẫu báo cáo, release_gate, checklist, `docs/work/61_uat_mvp.md`) là thay đổi chưa commit của người khác; không sửa.
- Chưa commit.
