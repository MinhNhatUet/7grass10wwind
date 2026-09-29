# Câu hỏi mở (BL-01)

| ID | Câu hỏi | Chặn BL | Người cần trả lời | Căn cứ | Trạng thái | Kết quả |
|---|---|---|---|---|---|---|
| Q-01 | Danh sách môn pilot chính thức: 6 môn (PRD 4.2/13.2) hay 2 môn (BL-02)? | BL-02, BL-03 (sau MVP) | Nhóm + GV | Mâu thuẫn tài liệu | Chưa trả lời | MVP tạm dùng D-02 |
| Q-02 | Mức nghiệm thu cuối cùng: cơ bản hay có thêm nâng cao? | BL-36, BL-40 | Nhóm | BL-01 | Chưa trả lời | |
| Q-03 | Người duyệt tài liệu và người xác nhận nhãn là GV nào? | BL-02, BL-03, BL-12 | GV / Trung tâm X | BL-01, PRD 13.3 | Chưa trả lời | |
| Q-04 | Ngân sách, thời hạn lưu trữ (retention), giới hạn file | BL-25, BL-26, BL-09 | Nhóm + Trung tâm X | BL-01 | Chưa trả lời | |
| Q-05 | Ngưỡng NFR-01…05 (đang là "đề xuất pilot cần xác nhận") | BL-30 | Nhóm + GV | PRD 12.1 | Chưa trả lời | |
| Q-06 | Ngưỡng RAGAS (đề xuất, phải duyệt trước khi chạy) | BL-36 | Nhóm + GV | PRD 13.5 | Chưa trả lời | |
| Q-07 | Chọn kho vector chính | BL-15 | TV3 | PRD 10.2 | Tạm cho MVP | D-21 |
| Q-08 | Cloud/provider để deploy | BL-29 | TV4 + nhóm | PRD 16.1 | Chưa trả lời | |
| Q-09 | Quyền sử dụng 30 sách tạm: 26 sách chưa đối chiếu giấy phép (`license_checked=false`), và `ai_processing_allowed` hiện đều là null | BL-02 | TV1 + GV | BR-01 | Chưa trả lời | |
| Q-10 | Thang `difficulty` cho TestCase | BL-03 | TV1 + GV | PRD 13.3 (không định nghĩa thang) | Chưa trả lời | |
| Q-11 | Hợp đồng request API: tên trường login, tạo hội thoại, gửi tin, tham số tìm kiếm; cách ánh xạ `document_id`/`version_id` sang `source_id` | BL-27, BL-28, BL-30 | TV2, TV3 | PRD 11 (chỉ có response) | Một phần | Login: D-17; các trường còn lại tạm theo D-10 |
| Q-12 | Thiếu mẫu kiểm thử: PPTX, PDF scan, hai phiên bản, tài liệu tính điểm, trùng sha256 | BL-02 (AC 3), BL-10, BL-33 | TV1 + GV | BL-02 | Chưa trả lời | |
| Q-13 | Có commit `docs/decisions/`, `docs/uat/`, `docs/handover/`, `docs/bugs/` lên repo không? | — | TV1 | R-05 | Chưa trả lời | |
| Q-14 | API/trace có trả danh sách context/chunk đã retrieve không (cho RAGAS và recall@k)? | BL-36 | TV2, TV3 | PRD 13.5, 11.3 | Chưa trả lời | Tạm D-14 |
| Q-15 | Endpoint AI_* có hỗ trợ embeddings không, model nào (AI_EMBEDDING_MODEL)? | BL-36 (answer_relevancy) | TV1/TV3 | PRD 13.5 | Đã trả lời | D-16 |
| Q-16 | Nhóm cam kết những Should nào (BL-31…39) cho nghiệm thu nâng cao? | BL-40 | Nhóm | PRD 14.3 | Chưa trả lời | |
| Q-17 | Hiệu chỉnh `retrieval_min_score` (0,55): câu tiếng Việt ngắn trên sách tiếng Anh đạt ~0,54 nên bị chặn | BL-18, BL-21 | TV1 + TV3 | PRD 10.2 (hiệu chỉnh trên dev) | Xử lý tạm | Router trả `search_terms` (thuật ngữ + tên tiếng Anh) ghép vào câu truy xuất: "cây khung" 0,505 → "cây khung (spanning tree)" 0,662. Ngưỡng 0,55 giữ nguyên, vẫn cần hiệu chỉnh trên tập dev (D-30) |
| Q-18 | Người duyệt cho COURSE-02/03 (hiện chỉ có `reviewer_course_01`) | BL-12 | Nhóm/GV | UAT-09 | Xử lý tạm | D-32: `reviewer_course_01` được cấp quyền duyệt COURSE-02/03 cho MVP; vẫn cần người duyệt thật cho từng môn |
