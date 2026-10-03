# Tài liệu EDU-04 — mục lục

Trợ lý học thuật RAG "Kho tri thức hỗ trợ học thuật X" (AI20K Build Phase, nhóm "7 cỏ 10 gió"). Cập nhật 2026-10-03.

## Bắt đầu từ đây

| Cần | Đọc |
|---|---|
| Chạy hệ thống (backend, frontend, dữ liệu SE101, tài khoản) | [handover/huong_dan_chay.md](handover/huong_dan_chay.md) |
| Hiện trạng code: kiến trúc, luồng câu hỏi, API, frontend, hạn chế | [documentions/mo_ta_du_an_hien_tai.md](documentions/mo_ta_du_an_hien_tai.md) |
| Phạm vi MVP thực tế, điểm cần cải tiến, tiêu chí nghiệm thu | [documentions/PRD_v2_MVP_edu04.md](documentions/PRD_v2_MVP_edu04.md) |
| Vì sao code lệch so với PRD v1 (D-xx) | [decisions/decision_log.md](decisions/decision_log.md) |
| Kết quả kiểm thử / UAT | [uat/uat_mvp.md](uat/uat_mvp.md#kết-quả-các-lượt-chạy), [eval/results/report.md](../eval/results/report.md) |

> **Kiến trúc:** `ARCHITECTURE.md` ở gốc repo và [architecture_diagram.md](architecture_diagram.md) là file gốc của template, còn nội dung mẫu (ChromaDB, agent gọi tool lặp) và **không** phản ánh code hiện tại. Kiến trúc thật xem [mô tả dự án §3](documentions/mo_ta_du_an_hien_tai.md#3-kiến-trúc) và [PRD v2 §5](documentions/PRD_v2_MVP_edu04.md#5-kiến-trúc-mvp): FastAPI + router LangGraph, SQLite, cosine NumPy sau lọc quyền.

## Yêu cầu sản phẩm — `documentions/`

| File | Nội dung |
|---|---|
| [PRD_edu04.md](documentions/PRD_edu04.md) | PRD v1: yêu cầu đích, FR-xx, BR-01…BR-13. Giữ để truy vết |
| [PRD_v2_MVP_edu04.md](documentions/PRD_v2_MVP_edu04.md) | PRD v2: bản MVP đã xây và lộ trình cải tiến |
| [backlog_edu04.md](documentions/backlog_edu04.md) | Backlog BL-xx theo epic E1–E7 |
| [brief_edu04.md](documentions/brief_edu04.md), [milestone_01_edu04.md](documentions/milestone_01_edu04.md), [wireframe&UIflow_edu04.md](documentions/wireframe&UIflow_edu04.md) | Brief, milestone 1, wireframe và luồng UI |
| [cong_viec_TV1_edu04.md](documentions/cong_viec_TV1_edu04.md) | Phân công TV1 |
| [mo_ta_du_an_hien_tai.md](documentions/mo_ta_du_an_hien_tai.md) | Hiện trạng code |
| [phan_cong_cai_tien_edu04.md](documentions/phan_cong_cai_tien_edu04.md) | Phân công cải tiến sau MVP cho 4 thành viên, quyền sở hữu file, hợp đồng dùng chung, cấu trúc thư mục |

## Quyết định — `decisions/`

[decision_log.md](decisions/decision_log.md) (D-xx) · [open_questions.md](decisions/open_questions.md) (Q-xx) · [pain_point_evidence.md](decisions/pain_point_evidence.md)

## Vận hành — `handover/`

[huong_dan_chay.md](handover/huong_dan_chay.md) (chạy và dùng thử) · [van_hanh.md](handover/van_hanh.md) (bộ công cụ kiểm chứng: kiểm kê nguồn, dataset, accuracy/safety/router, RAGAS, benchmark)

## Kiểm thử và nghiệm thu — `uat/`

| File | Nội dung |
|---|---|
| [uat_mvp.md](uat/uat_mvp.md) | Bộ 38 ca UAT MVP + bảng kết quả các lượt chạy |
| [uat_mvp_report.md](uat/uat_mvp_report.md) | **Mẫu** báo cáo (để trống), không phải kết quả |
| `uat_mvp_report_UAT_*.md` | Báo cáo từng lượt: [20261002](uat/uat_mvp_report_UAT_20261002.md), [20261003](uat/uat_mvp_report_UAT_20261003.md) |
| [release_gate.md](uat/release_gate.md) | Cổng phát hành BL-30 (đang **MỞ**) |
| [uat_checklist.md](uat/uat_checklist.md), [uat_report.md](uat/uat_report.md) | Bộ UAT gốc PRD v1 (UAT-01…20), giữ để truy vết |
| [advanced_acceptance.md](uat/advanced_acceptance.md), [value_measurement.md](uat/value_measurement.md) | Nghiệm thu nâng cao (BL-40), đo giá trị sử dụng |

## Khác

| Mục | Ghi chú |
|---|---|
| [ui-completion-roadmap.md](ui-completion-roadmap.md) | Lộ trình hoàn thiện giao diện (phần còn mở + lịch sử) |
| [archive/reviews/](archive/reviews/) | Báo cáo rà soát cũ (27/09, 30/09), chỉ để tham khảo lịch sử |
| [guide/](guide/) | **Tài liệu đào tạo của template** AI20K (Technical Guidebook), đồng bộ từ upstream, không phải hướng dẫn sản phẩm. Không sửa |
| `plans/`, `rules/`, `work/` | Tài liệu cục bộ (gitignore); tài liệu bàn giao không phụ thuộc vào chúng |
