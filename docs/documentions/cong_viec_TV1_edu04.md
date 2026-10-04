# CÔNG VIỆC TV1 — NGÔ ĐINH MINH NHẬT (EDU-04)

| Thuộc tính | Nội dung |
|---|---|
| Thành viên | Ngô Đinh Minh Nhật — MSV 2A202602569 |
| Mã trong nhóm | TV1 |
| Vai trò | BA, điều phối, QA/UAT, nhãn và báo cáo |
| Nhóm | 7 cỏ 10 gió — EDU-04 "Kho tri thức hỗ trợ học thuật X" |
| Căn cứ | [Backlog](backlog_edu04.md) (v2.0), [PRD](PRD_edu04.md) (v2.0), [Brief](brief_edu04.md) |
| Trạng thái | Tất cả hạng mục đang ở **Draft** theo backlog; chưa có kết quả nào đã đạt |

> File này tổng hợp lại phần việc của TV1 từ backlog/PRD. Khi backlog/PRD thay đổi, tài liệu gốc là nguồn chuẩn.

## 1. Tóm tắt trách nhiệm

- **Nghiệp vụ (BA):** chốt phạm vi, quyết định mở, decision log; xác thực pain point PP-01…PP-10 (Brief mục 3).
- **Dữ liệu:** kiểm kê nguồn, quyền sử dụng, nhãn môn, ACL cho từng tài liệu.
- **Kiểm chứng:** xây bộ dev/holdout 100 mẫu, rubric, safety suite ≥40 ca; chạy eval accuracy và safety/regression.
- **QA/UAT & điều phối:** test luồng hằng ngày, ghi bug, quản lý cổng phát hành cơ bản (BL-30) và nâng cao (BL-40).
- **Báo cáo:** báo cáo accuracy/safety/UAT, tài liệu bàn giao.

"Owner" nghĩa là chịu trách nhiệm kéo hạng mục tới Done, không phải làm một mình. GV (hoặc người được ủy quyền) mới là người xác nhận nguồn, nhãn và chất lượng học thuật; TV1 không thay vai trò này.

## 2. Hạng mục backlog do TV1 làm owner

| ID | Hạng mục | Epic | Phạm vi | Ưu tiên | SP | Phụ thuộc | Truy vết |
|---|---|---|---|---|---|---|---|
| BL-01 | Chốt scope, quy tắc và các quyết định mở | E1 | Must | A | 3 | — | PRD 4/5/17 |
| BL-02 | Kiểm kê nguồn, quyền sử dụng và nhãn môn | E1 | Must | A | 5 | BL-01 | FR-06, BR-06 |
| BL-03 | Dev/holdout (100 mẫu, 5 nhóm ×20), rubric, safety | E1 | Must | A | 8 | BL-01, BL-02 | PRD 13.1–13.3 |
| BL-27 | Chạy eval accuracy (100 mẫu) và phân tích lỗi | E6 | Must | A | 8 | BL-03, BL-21, BL-22, BL-23, BL-25 | PRD 13.1–13.4/13.7, UAT-17 |
| BL-28 | Security, safety và integration regression | E6 | Must | A | 8 | BL-14, BL-17, BL-20, BL-24, BL-25, BL-26 | UAT-02/07/11/13/15/19 |
| BL-30 | UAT, hiệu năng và tài liệu bàn giao cơ bản | E6 | Must | B | 5 | BL-16, BL-23, BL-24, BL-27, BL-28, BL-29, BL-35 | PRD 14/16 |
| BL-36 | RAGAS và mở rộng bộ kiểm chứng vượt 100 mẫu | E7 | Should | C | 8 | BL-31, BL-32, BL-33, BL-34 | FR-14, PRD 13.5 |
| BL-40 | Benchmark và nghiệm thu nâng cao | E7 | Should | C | 5 | BL-34, BL-36, BL-37, BL-38, BL-39 | UAT-18, PRD 14.3 |

**Tổng:** 8 hạng mục — Must 6 (37 SP), Should 2 (13 SP).

## 3. Kế hoạch theo tuần

| Tuần | Việc của TV1 | Mốc liên quan |
|---|---|---|
| 1 | Chốt scope ngày 1–2 (BL-01); kiểm kê và xác nhận nguồn (BL-02); chuẩn bị nhãn/dev/holdout với GV (BL-03); fixtures ACL | M1: SV đăng nhập, chỉ thấy môn được cấp |
| 2 | Tiếp tục gán đủ 100 nhãn holdout (5 nhóm ×20) và safety suite; test từng luồng hằng ngày; ghi bug | M2: upload → duyệt → tìm/mở nguồn → thu hồi; M3: hai trợ lý có citation |
| 3 | Chấm 100 mẫu holdout cùng GV (BL-27), safety/regression (BL-28), UAT và báo cáo; quản lý cổng BL-30 | M4: ≥80/100 holdout đạt, safety đạt, demo Docker |
| 4 | Đầu tuần tham gia chốt phạm vi nâng cao theo capacity thật; chuẩn bị RAGAS/báo cáo và regression song song | — |
| 5 | BL-36 theo capacity và phụ thuộc; review phạm vi BL-40 | Bộ kiểm chứng cuối sẵn sàng |
| 6 | BL-40 nếu đăng ký nâng cao; chạy lại các cổng BL-27/28/30 bị ảnh hưởng; báo cáo cuối | M5: nâng cao có bằng chứng trên cấu hình mới |

**Điểm kiểm tra tuần 3:** đầu tuần chạy đầy đủ đánh giá và kiểm thử lần đầu; giữa tuần xử lý lỗi và kiểm tra lại; cuối tuần nghiệm thu bản cơ bản. **Không để đến ngày cuối mới chạy 100 câu.**

**Tín hiệu đỏ cần báo ngay:** cuối tuần 1 chưa có nguồn Published trên demo; cuối tuần 2 chưa chạy đủ hai trợ lý. Mốc tuần 3 không tự lùi.

## 4. Chi tiết từng hạng mục

### 4.1. BL-01 — Chốt phạm vi và quyết định mở

**Mục tiêu:** cả nhóm hiểu sản phẩm giống nhau và thống nhất mức nghiệm thu.

- [ ] Walkthrough Brief/PRD/wireframe cùng nhóm
- [ ] Chọn mức nghiệm thu: cơ bản / nâng cao
- [ ] Chốt môn pilot, người duyệt, ngân sách, retention, giới hạn file và tiêu chí
- [ ] Lập decision log và danh sách câu hỏi chưa trả lời
- [ ] Xác thực pain point PP-01…PP-10: phỏng vấn/quan sát ngắn ngày 1–2, ghi sổ bằng chứng; phân biệt sự cố thực tế / lời người dùng báo cáo / rủi ro dự phòng; không gán số liệu giả

**AC:**
- Mỗi quyết định có người xác nhận, ngày và phạm vi áp dụng; giả định chưa xác nhận được đánh dấu rõ.
- Không trộn phạm vi ngoài dự án, Must/Should và ngưỡng đề xuất với kết quả đã đạt.
- Có bảng ánh xạ người phụ trách nghiệp vụ, nguồn và nhãn; điểm chưa chốt chặn việc phụ thuộc được ghi thành blocker.

**Bằng chứng:** phiên bản tài liệu đã review + decision log.

### 4.2. BL-02 — Kiểm kê và chuẩn bị nguồn

**Mục tiêu:** biết nguồn nào được phép đưa vào pilot và ai được đọc.

- [ ] Lập danh mục đề xuất 2 môn / 30–50 tài liệu
- [ ] Xác nhận quyền xử lý tài liệu với dịch vụ AI
- [ ] Kiểm kê PDF/PPTX/scan
- [ ] Gắn phiên bản, môn, ACL, nhãn tính điểm/đáp án và nguồn gốc
- [ ] Chọn mẫu file cho test: hợp lệ, scan, lỗi, trùng, hai phiên bản

**AC:**
- Mỗi nguồn có chủ sở hữu/người xác nhận, môn, loại file, phiên bản, trạng thái quyền sử dụng.
- Nguồn chưa được phép không vào pipeline phục vụ; đáp án GV không có ACL của SV.

**Bằng chứng:** data inventory + quyết định sử dụng nguồn. Dữ liệu nhạy cảm không đưa vào tài liệu công khai.

### 4.3. BL-03 — Bộ nhãn, rubric và safety fixtures

**Mục tiêu:** có bộ kiểm chứng độc lập, không đánh giá qua vài câu demo.

- [ ] Tập **dev** riêng 20–30 câu, không trùng/gần trùng holdout
- [ ] **Holdout 100 mẫu**, đúng 20 mẫu cho mỗi nhóm:

| Nhóm câu hỏi | Số mẫu | Kiểm chứng |
|---|---|---|
| Tra cứu/định nghĩa | 20 | Tìm đúng nội dung và nguồn |
| Giải thích khái niệm | 20 | Diễn giải đúng, không tự thêm thông tin |
| So sánh/tổng hợp nhiều đoạn | 20 | Kết nối bằng chứng, không trộn sai khái niệm |
| Vận dụng kiến thức (ví dụ không tính điểm) | 20 | Suy luận đúng từ nguyên lý có nguồn |
| Câu nối tiếp có ngữ cảnh định sẵn | 20 | Giữ ngữ cảnh, phạm vi môn và citation |

- [ ] Phân bổ theo môn theo ma trận PRD 13.2 (6 môn: 17–17–17–17–16–16); thay "Môn 1…6" bằng tên thật và khóa trước khi chạy
- [ ] Mỗi case theo schema PRD 13.3: `case_id`, `split`, `course_id`, `user_role`, `permission_fixture`, `question`, `conversation_context`, `reference_answer`, `required_key_points`, `allowed_source_versions`, `reference_locators`, `question_type`, `difficulty`, `expected_behavior`, `label_author`, `label_reviewer`, `dataset_version`
- [ ] Rubric 4 tiêu chí (PRD 13.4): đúng kiến thức, đủ câu trả lời, grounding, citation — chấm pass/fail từng tiêu chí, có lý do
- [ ] **Safety suite ≥40 ca** (PRD 13.6): 12 phân quyền/rò rỉ; 12 liêm chính (trực tiếp + nhiều lượt); 8 thiếu nguồn/mâu thuẫn/nguồn thu hồi; 8 prompt injection/citation giả/file bất thường; thêm ca học tập hợp lệ để bắt chặn quá mức
- [ ] Review nhãn cùng GV
- [ ] Khóa version/checksum và quyền truy cập holdout

**AC:**
- Câu có nguồn tách khỏi ca thiếu nguồn/từ chối.
- Đủ 100 mẫu hợp lệ, đúng 20/nhóm; chưa đủ thì **chưa đủ điều kiện chạy nghiệm thu** — không dùng bộ nhỏ hơn thay thế.
- Dev và holdout không trùng/gần trùng; holdout **không dùng để tinh chỉnh** trước vòng đánh giá (BR-12).
- Nhãn có tác giả/người review; ca nhiều lượt lưu đủ ngữ cảnh và hành vi mong đợi.

**Bằng chứng:** dataset version, rubric, nguồn đối chiếu, danh sách reviewer. Holdout không commit lên repo công khai — repo chỉ chứa manifest/schema/checksum.

### 4.4. BL-27 — Accuracy trên holdout

- [ ] Eval runner ghi snapshot/config
- [ ] Chạy đủ 100 mẫu; lưu output thô, citation, lỗi, latency, token/cost; ghi rõ cache bật/tắt (mặc định không tái dùng đáp án cache)
- [ ] Chấm rubric; người thứ hai chấm độc lập ≥20% mẫu + toàn bộ ca tranh chấp; GV xử lý bất đồng
- [ ] Báo accuracy tổng (/100), theo 5 nhóm (/20), theo môn (/16 hoặc /17)
- [ ] Phân tích nguyên nhân không đạt: data / retrieval / generation / citation / routing
- [ ] Điền mẫu báo cáo PRD 13.8

**Công thức:** `Accuracy = số câu đạt cả 4 tiêu chí / 100 × 100%`

**AC:**
- **≥80/100** đạt cả bốn tiêu chí; mẫu số khóa, không làm tròn dưới 80%.
- Timeout, lỗi hệ thống, từ chối sai, citation sai = không đạt. Không trộn safety vào accuracy.
- Mock LLM không dùng làm bằng chứng; LLM tự chấm không là bằng chứng duy nhất.
- Chưa đạt → tạo bug/task sửa. Nếu đã dùng lỗi holdout để sửa, lần chạy lại là **regression trên bộ đã biết**; cần holdout mới cho ước lượng độc lập. Không chọn riêng lần tốt nhất.
- Không đổi rubric sau khi xem điểm.

### 4.5. BL-28 — Safety và regression đầu cuối

- [ ] Chạy safety suite
- [ ] Truy cập chéo môn/owner; đáp án GV
- [ ] Đa lượt / prompt injection
- [ ] Revision race; thu hồi trong lúc đang query
- [ ] Lịch sử / snippet / count / download
- [ ] Retention; retry/idempotency
- [ ] Tạo bug kèm fixture cho mỗi lỗi

**AC:** không còn ca lộ tài liệu, đáp án tính điểm hoặc nguồn chưa duyệt trong bộ bắt buộc; kiểm tra cả backend và UI; ca hợp lệ không bị chặn quá mức; P0/P1 chặn phát hành; không bỏ test để đạt.

### 4.6. BL-30 — Cổng cơ bản và bàn giao

- [ ] Walkthrough UI-01…UI-03, UI-06…UI-09 (UI-03 hợp nhất Academic/Learning/Hub; UI-09 Dashboard GV là Must)
- [ ] UAT với người dùng đại diện
- [ ] Đo tải/latency trên corpus pilot (p50/p95, cache state)
- [ ] Tổng hợp accuracy/safety
- [ ] Hướng dẫn SV / GV / vận hành; demo script/video nếu yêu cầu; biên bản lỗi/phạm vi
- [ ] Đo giá trị sử dụng theo pain point Brief mục 3 (tìm đúng đoạn/phiên bản, mở nguồn, giải thích lại khái niệm); chưa đo thì ghi rõ

**AC:** BL-01…BL-29 và BL-35 hoàn tất; ≥80/100 holdout đạt; safety đạt; không P0/P1; có URL/demo, version phát hành, hướng dẫn và người xác nhận. Chưa đạt → giữ cổng mở, bổ sung việc khắc phục.

### 4.7. BL-36 — RAGAS và mở rộng eval (Should)

- [ ] Version metric / judge model / embedding / config
- [ ] Chạy faithfulness, answer relevancy, context precision; bổ sung retrieval recall@k, citation, router scores
- [ ] Mở rộng bộ mẫu vượt 100 câu nếu đủ nguồn lực, tách dev và nhãn kiểm tra

**AC:** RAGAS tách khỏi accuracy người chấm; ngưỡng đề xuất (faithfulness ≥0,85; answer relevancy ≥0,80; context precision ≥0,75) phải được xác nhận **trước** khi chạy — không phải yêu cầu gốc; giữ lượt đánh giá lỗi, không bỏ âm thầm; báo số mẫu thực tế.

### 4.8. BL-40 — Nghiệm thu nâng cao (Should)

- [ ] Khóa config/corpus
- [ ] Chạy lại accuracy/safety/UAT bị ảnh hưởng
- [ ] Benchmark baseline vs nâng cao, cache hit/miss
- [ ] Rà OCR/dedup/router/dashboard; cập nhật tài liệu và demo

**AC:** mọi Should đã cam kết có bằng chứng; accuracy vẫn ≥80%; không P0/P1; RAGAS không thay accuracy; nêu trade-off chi phí/độ trễ/chất lượng; hạng mục bị bỏ phải ghi thay đổi phạm vi.

## 5. Kiểm tra chéo cho thành viên khác

| Thành viên | Phần TV1 kiểm tra |
|---|---|
| TV2 — Ngụy Quang Hùng (Backend) | Test nghiệp vụ: auth, ACL, API, trạng thái, audit |
| TV3 — Nguyễn Văn Việt (AI/RAG) | Kiểm chứng kết quả retrieval, citation, guardrails, eval |
| TV4 — Đinh Văn Bình (Frontend) | UAT giao diện, trạng thái, nguồn, demo |

Ngược lại, TV2 kiểm tra tính khả thi của yêu cầu/test do TV1 đưa ra; GV kiểm tra học thuật của nhãn và rubric.

## 6. Cổng phát hành TV1 tham gia kiểm tra

| Cổng | Điều kiện | Bằng chứng | Người kiểm tra |
|---|---|---|---|
| Dữ liệu | Nguồn có quyền sử dụng, đúng nhãn, đã duyệt | Inventory, approval/audit | TV1 + GV |
| Chức năng | Must chạy đầu cuối, UI đúng flow | UAT theo vai trò/môn | TV1 + người dùng đại diện |
| Chất lượng AI | ≥80/100 trên bộ khóa (5 nhóm ×20) | Output, rubric, người chấm, config | TV1 + GV |
| An toàn | Không ca nghiêm trọng trong safety suite | Báo cáo BL-28 + regression | TV2 + TV1 |
| Bàn giao | Hướng dẫn, version, giới hạn, lỗi còn lại | Tài liệu + biên bản | Cả nhóm |

Không hạ ngưỡng sau khi biết điểm.

## 7. Quản lý bug

Workflow board: `Draft → Ready → In Progress → Review → QA/UAT → Done`. QA không đạt → quay lại In Progress, giữ bằng chứng. Blocked phải có lý do, người gỡ, ngày xem lại.

Mức độ: **P0** lộ dữ liệu/secret/sai quyền nghiêm trọng; **P1** lộ đáp án tính điểm, công bố chưa duyệt, mất dữ liệu, hỏng luồng cốt lõi; **P2** có workaround; **P3** trình bày nhỏ. P0/P1 chặn phát hành. Bug phát hiện từ holdout phải đánh dấu nguồn phát hiện.

Mẫu bug:

```text
ID: BUG-<số>
Tiêu đề: <Hành vi sai và tình huống kích hoạt>
Story/FR/UAT liên quan:
Môi trường / build / model / prompt / corpus version:
Vai trò và phạm vi quyền của tài khoản test:
Các bước tái hiện:
Kết quả mong đợi:
Kết quả thực tế:
Bằng chứng đã loại bỏ secret/thông tin nhạy cảm:
Mức độ: P0 / P1 / P2 / P3
Owner / trạng thái / cách xác minh sau sửa:
```

## 8. Nguyên tắc cần giữ

- Không dùng holdout, đáp án tham chiếu hoặc log kiểm chứng để tinh chỉnh trước khi báo kết quả vòng đó (BR-12).
- Không commit `.env`, dữ liệu holdout, nguồn không được phép hoặc hội thoại riêng lên repo.
- Không bắt đầu xử lý dữ liệu thật khi quyền sử dụng chưa rõ.
- Không ghi Done chỉ vì đã mở PR hoặc chỉ có mock/thiết kế.
- Mỗi người tối đa một story chính In Progress; lúc chờ thì hỗ trợ review/test.
