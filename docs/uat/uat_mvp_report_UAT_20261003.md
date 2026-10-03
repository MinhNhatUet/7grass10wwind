# Báo cáo thực thi UAT MVP — lượt UAT_20261003 (tự động mức API, model gpt-4o-mini)

Bộ ca: [uat_mvp.md](uat_mvp.md) phiên bản 1.0. Lượt trước: [UAT_20261002](uat_mvp_report_UAT_20261002.md).

> **Kết quả lượt cuối `UAT_20261003_0933`:**
> - **16 Pass · 0 Fail · 22 Blocked / 38 ca**, chạy liền mạch một lượt trên code cuối.
> - Mọi ca Blocked đều đạt hết tiêu chí máy kiểm được. Chúng Blocked chỉ vì còn phần cần GV chấm, cần quan sát UI, thiếu fixture, cơ chế giả lập hoặc dataset (giống lượt trước).
> - **Kết luận: Chưa thể kết luận nghiệm thu.** Đây là lượt kỹ thuật viên chạy tự động, không thay người nghiệm thu.

## 1. Thông tin lượt chạy

| Trường | Giá trị |
|---|---|
| Các lượt | `UAT_20261003_0906` (toàn bộ, code `8e6bf7e`): 12 Pass / 4 Fail / 22 Blocked · `0917` (chạy lại 8 ca sau sửa router) · `0921` (toàn bộ): 15 / 2 / 21 · `0933` (toàn bộ, code cuối): **16 / 0 / 22** |
| Code | `8e6bf7e` cộng các sửa D-72 (chưa commit lúc chạy): `src/agents/nodes/orchestration.py`, `src/services/assistants/{__init__,academic,learning}.py`, `eval/uat/run_uat_mvp.py` |
| Model | LLM `gpt-4o-mini` (vilao); embedding `gemini-embedding-001` |
| Môi trường | Bản sao `data/app.db` cho từng lượt, backend riêng ở cổng 8100. Cấu hình UAT giống lượt trước (upload 1 MB, cửa sổ đăng nhập sai 20 s, quota 2 khi chạy ADM-03) |
| Chi phí lượt `0933` | 43 lượt có ghi usage, 181.454 / 10.280 token vào / ra, ≈ 0,022 USD |
| Độ trễ chat lượt `0933` | p50 6,8 s · p95 13,4 s (n=35) |
| Bằng chứng | `data/uat_runs/<run_id>/` (gitignore) |

## 2. Lỗi phát hiện sau khi đổi sang gpt-4o-mini và cách xử lý

| Bug ID | Ca | Mức | Mô tả | Xử lý (D-72) | Retest |
|---|---|---|---|---|---|
| UAT-BUG-20261003-01 | DOC-01, QA-04, QA-06 | **P1** | Router chuyển câu hỏi nội dung có chữ "tài liệu" ("Theo tài liệu, X…?", "Tài liệu này nói gì về…", "Tóm tắt tài liệu…") sang **Knowledge Hub**: người dùng nhận "Tìm thấy N tài liệu" thay vì câu trả lời | Prompt router: Hub CHỈ khi muốn tìm / liệt kê / mở tài liệu; câu hỏi nội dung dù nhắc "tài liệu" là academic, có ví dụ cụ thể | Router 7/7 câu đúng (×2); DOC-01, QA-06 Pass |
| UAT-BUG-20261003-02 | ACL-03, DOC-01 | **P1** | Model trả lời đúng và có trích nguyên văn ở `quotes`, nhưng **quên gắn [n]**, nên FR-10.3 biến câu trả lời thành "không đủ căn cứ" (lúc có lúc không) | `_restore_citations`: chỉ khi câu trả lời không có [n] nào thì gắn [n] cho nguồn có câu trích nguyên văn (≥ 20 ký tự) **thật sự có trong chunk** (server kiểm). Trích giả thì vẫn từ chối | Tự kiểm 5/5; ACL-03 18/18 Pass |
| UAT-BUG-20261003-03 | DOC-03 | **P1** | Dịch sai số liệu: nguồn "lasts **fourteen** days" thành "kéo dài **bốn** ngày" | BASE_POLICY: giữ đúng số liệu / đơn vị / ngưỡng như nguồn, viết bằng chữ số | DOC-03 8/8 Pass |
| UAT-BUG-20261003-04 | PLAN-01 | **P1** | Lộ trình theo ngày chọn trên lịch: model trả `feasible=false`, 0 buổi (3/3 lần), nên người dùng chỉ nhận câu hỏi lại | Prompt: luôn lập lộ trình phần cốt lõi vừa quỹ thời gian, phần thiếu thời gian liệt kê ở `deferred`; server hiện cảnh báo "Chưa đủ thời gian cho: …" (vẫn báo quá tải, AC-03.4) | 3/3 lần tạo được (trước 0/3); PLAN-01 7/7 |

**Lỗi bộ kiểm thử (đã sửa):**
- AUTH-03 so sánh nguyên body lỗi, mà mỗi response có `request_id` riêng (D-65). Nay chỉ so mã HTTP và mã lỗi.
- QA-04 trước đây "đạt" dù câu hỏi bị chuyển sang Hub, vì không có trích dẫn nào thì vẫn thỏa "chỉ trích tài liệu A". Nay bắt buộc phải có trích dẫn từ tài liệu A.

## 3. Kết quả từng ca (lượt `0933`)

| Nhóm | Pass | Blocked (đạt mọi tiêu chí máy, còn thiếu…) |
|---|---|---|
| Đăng nhập, quyền | AUTH-02, AUTH-03, ACL-01, ACL-03 | AUTH-01, ACL-02 (UI); ACL-04 (điểm dừng giữa luồng) |
| Hỏi đáp | QA-02, QA-06 | QA-01, QA-05 (GV); QA-04 (UI); QA-03 (fixture) |
| Học tập, lộ trình | — | LA-01…03, PLAN-01, PLAN-02 (GV); PLAN-03 (nhập lịch, UI) |
| Tài liệu | DOC-01, DOC-02, DOC-03, DOC-05 | DOC-04 (UI) |
| Đề giảng viên | QZ-01, QZ-03, QZ-04, QZ-05, QZ-06 | QZ-02 (GV) |
| Quản trị, vận hành | ADM-01 | ADM-02, ADM-03, OPS-02 (UI); OPS-01 (429 embedding) |
| Dữ liệu, UX, cổng | — | DATA-01 (GV xác nhận quyền nguồn), UX-01 (trình duyệt), GATE-01 (dataset) |

## 4. Kết luận
- **16/38 Pass (42%), 0 Fail, 22 Blocked.** Không có lỗi rò rỉ quyền (P0). 4 lỗi P1 phát sinh do đổi model đã sửa và kiểm lại.
- `gpt-4o-mini` kém ổn định hơn model trước (định tuyến, gắn trích dẫn, dịch số, lập lộ trình). Mỗi điểm đã có chốt chặn ở server hoặc prompt, nhưng vẫn cần holdout (GATE-01) để đo độ chính xác thật.
- Còn cần: GV chấm nội dung, chạy phần UI, holdout/safety dataset, cơ chế giả lập 429 và điểm dừng.

## 5. Lượt bổ sung `UAT_20261003_1025` (D-73, D-74)

- Code: thay đổi D-73 (kiểm trích dẫn theo từng câu) và D-74 (câu hỏi/thẻ AI soạn phải có câu trích `proof` có thật trong nguồn), chưa commit lúc chạy.
- Bộ kiểm thử thêm tiêu chí:
  - LA-01, LA-02: mỗi mục có `proof`, không có câu trùng.
  - QZ-02: mỗi câu tạo từ tài liệu học có "Căn cứ trong tài liệu".
- Kết quả toàn bộ: **16 Pass · 0 Fail · 22 Blocked**, không hồi quy so với lượt `0933`. LA-01 19/19, LA-02 33/33, QZ-02 13/13 tiêu chí máy.
- Trong quá trình sửa, lượt `1017` có QZ-02 **Fail**: model dịch `proof` sang tiếng Việt nên không câu nào kiểm được. Đã sửa prompt để giữ ngôn ngữ gốc. Chi tiết ở `docs/work/77_kiem_chung_cau_hoi_dap_an.md`.
- Kết luận không đổi: **chưa thể kết luận nghiệm thu.**
