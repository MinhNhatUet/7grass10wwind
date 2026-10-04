# Nhật ký công việc

Mỗi bước làm việc có một log tiếng Việt `NN_<chủ_đề>.md`: yêu cầu, mã BL/FR/BR, file đã sửa, lệnh kiểm tra và kết quả thật, việc còn lại. Đây là **lịch sử** công việc, không phải tài liệu vận hành. Hiện trạng xem [mô tả dự án](../documentions/mo_ta_du_an_hien_tai.md), cách chạy xem [hướng dẫn chạy](../handover/huong_dan_chay.md), quyết định xem [decision log](../decisions/decision_log.md).

Log do nhiều thành viên ghi song song nên có số trùng (vd. `55`); log trùng số của TV1 được đổi số hoặc thêm hậu tố chữ (`61a`). Mã “D-xx” trong tiêu đề một số log của thành viên khác không phải mã trong decision log.

| # | Nội dung |
|---|---|
| 30 | [Ẩn nguồn khi tạo đề/lộ trình, hiện dẫn chứng sau khi trả lời](30_an_nguon_hien_dan_chung.md) |
| 31 | [Pull code nhánh TV4 (f57119b) + gộp trang Lộ trình học](31_pull_tv4_gop_lo_trinh.md) |
| 32 | [Dọn file theo `docs/file-cleanup-review-2026-09-30.md` (phần rủi ro thấp)](32_don_file_theo_review.md) |
| 33 | [Lỗi "AI đang tạm thời không khả dụng" và lỗi hydration](33_loi_llm_va_hydration.md) |
| 34 | [Hiển thị công thức kiểu LaTeX (KaTeX)](34_cong_thuc_latex.md) |
| 35 | [Nguồn tham khảo hiện đúng công thức như sách](35_nguon_hien_anh_trich.md) |
| 36 | [Nguồn tham khảo hiện chữ, công thức đúng (xử lý lại 2 sách)](36_nguon_chu_cong_thuc_dung.md) |
| 37 | [Sửa / xoá lộ trình học, kiểm tra tính năng ôn tập](37_sua_xoa_lo_trinh.md) |
| 38 | [Ôn tập theo chương](38_on_tap_theo_chuong.md) |
| 39 | [Tạo bài ôn tập / lộ trình: chuyển sang chat ngay](39_chuyen_sang_chat_ngay.md) |
| 40 | [Lộ trình học theo ngày cụ thể (chọn trên lịch)](40_lo_trinh_chon_ngay.md) |
| 41 | [Demo môn Công nghệ phần mềm từ dữ liệu thật (`data/artifacts`)](41_demo_cnpm_du_lieu_that.md) |
| 42 | [Dọn sạch dữ liệu dev cũ, chỉ còn môn SE101](42_don_sach_du_lieu_cu.md) |
| 43 | [Nối backend với dữ liệu hiện tại (SE101)](43_noi_backend_du_lieu_hien_tai.md) |
| 44 | [Trích dẫn đúng trang, embedding theo chunk của pipeline](44_trang_theo_chunk.md) |
| 45 | [Trích dẫn theo khoảng trang (vd. "Trang 4–6")](45_trich_dan_khoang_trang.md) |
| 46 | [Ôn tập: chọn nhiều bài, không tự gõ chủ đề](46_on_tap_chon_nhieu_bai.md) |
| 47 | [Tạo lộ trình: chọn bài thay vì gõ nội dung](47_lo_trinh_chon_bai.md) |
| 48 | [Pull và tích hợp code mới từ nhánh TV4](48_pull_tv4_e607f5f.md) |
| 49 | [Merge nhánh `quanghung` (frontend + backend) có chọn lọc](49_merge_quanghung.md) |
| 50 | [Giao diện liền mạch: khung chung cho các trang học tập](50_khung_chung_lien_mach.md) |
| 51 | [Đoạn trích hiện ngay tại [n] trong câu trả lời](51_trich_dan_tai_cho.md) |
| 52 | [Dẫn chứng riêng cho từng [n], đủ ý](52_dan_chung_rieng_tung_cau.md) |
| 53 | [Làm sạch `ruff check .` toàn repo](53_ruff_toan_repo.md) |
| 54 | [Citation của mọi hoạt động học: đúng trang, hiện bằng [n] (D-57)](54_dan_chung_tung_the.md) |
| 55 | [D-55 — Bỏ qua file quy định agent cục bộ](55_ignore_coding_agent_rules.md) |
| 55 | [Ghi tên tài liệu thay cho "nguồn 1" (D-58)](55_ten_tai_lieu_thay_nguon_so.md) |
| 56 | [UI giảng viên gọn 3 mục + tạo đề trắc nghiệm từ PDF (D-59)](56_ui_giang_vien_de_tu_pdf.md) |
| 57 | [Trang "Chi phí AI" cho admin (D-60)](57_chi_phi_ai_admin.md) |
| 58 | [Admin bỏ Hỏi đáp; khu quản trị 4 nhóm (D-61)](58_admin_bo_hoi_dap.md) |
| 59 | [Bỏ trang hồ sơ cá nhân, chỉ hiện tên (D-62)](59_bo_ho_so_ca_nhan.md) |
| 60 | [Viết PRD v2 cho bản MVP](60_prd_v2_mvp.md) |
| 61 | [Bộ UAT cho MVP hiện tại](61_uat_mvp.md) |
| 61a | [Frontend sạch build / tsc / lint (bước 1–2 của bản rà soát)](61a_frontend_sach_lint_tsc.md) |
| 62 | [Gỡ code mẫu template và giao diện cũ (D-63)](62_go_code_mau_va_ui_cu.md) |
| 63 | [Chạy UAT MVP tự động mức API, sửa 2 lỗi P1, công bố kết quả eval](63_uat_mvp_tu_dong.md) |
| 64 | [Logging đợt 1: log JSON + mã truy vết theo request (D-65)](64_logging_dot_1.md) |
| 65 | [Đoạn trích của [n] sai ý/sai trang và trùng nhau (D-66)](65_doan_trich_dung_y.md) |
| 66 | [Đổi model sang gpt-4o-mini: backend không nhận model mới, trả lời thiếu căn cứ và trả lời tiếng Anh (D-68)](66_on_dinh_tra_loi_gpt4o_mini.md) |
| 67 | [Đáp án trắc nghiệm toàn A → chia đều A–D (D-69)](67_dao_dap_an_trac_nghiem.md) |
| 68 | [Trích dẫn bao trọn nội dung trải nhiều trang liền nhau (D-70)](68_trich_dan_nhieu_trang.md) |
| 69 | [Nút "Đăng nhập demo" chọn 3 vai trò (D-71)](69_dang_nhap_demo.md) |
| 70 | [D-70 — Cất thay đổi local và pull code mới](70_stash_pull_ndmnhat.md) |
| 71 | [D-71 — Khôi phục stash và xử lý xung đột](71_khoi_phuc_stash.md) |
| 72 | [D-72 — Build và chạy lại Docker sau khi pull](72_rebuild_docker.md) |
| 73 | [D-73 — Rà soát thay đổi local trước khi push](73_ra_soat_truoc_push.md) |
| 74 | [D-74 — Dọn thay đổi và push theo yêu cầu](74_don_thay_doi_va_push.md) |
| 75 | [Chạy lại UAT với gpt-4o-mini, sửa 4 lỗi P1 (D-72)](75_uat_gpt4o_mini.md) |
| 76 | [Kiểm trích dẫn theo từng câu (D-73)](76_kiem_trich_dan_tung_cau.md) |
| 77 | [Kiểm chứng câu hỏi – đáp án – nguồn cho hoạt động học (D-74)](77_kiem_chung_cau_hoi_dap_an.md) |
| 78 | [Dọn và đồng bộ tài liệu theo bản rà soát](78_don_tai_lieu.md) |
