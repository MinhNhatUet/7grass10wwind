# Nghiệm thu grounding theo claim — BL-18/21 · FR-02/10 · BR-04/05

## Trạng thái

Đây là **quy trình đối chiếu với giảng viên**, chưa phải báo cáo đã đạt. Regression offline dùng verdict mock chỉ chứng minh bộ lọc thực thi đúng; không chứng minh LLM verifier hiểu đúng nội dung môn học.

Academic hiện cần một lượt sinh claims và một lượt verifier cho cả batch; cả hai qua `get_llm()` và được cộng vào usage. Verifier dùng cùng provider/model cấu hình nhưng prompt độc lập: đây không phải hai mô hình độc lập và có thể cùng sai. Không phát hành draft khi verifier/schema/provider lỗi. Không có fallback sang tự gắn citation bằng khớp từ.

## Dữ liệu và người chấm

- Dùng bộ câu hỏi chuẩn có đáp án/ý chính và phiên bản nguồn do giảng viên xác nhận. Dev để tinh chỉnh; holdout đã khóa chỉ để nghiệm thu, không đọc/tinh chỉnh ngược từ holdout.
- Giữ nội dung câu hỏi, đáp án, câu trích và draft có thể bị loại trong `data/eval/` (gitignored). Repo chỉ chứa schema/quy trình/checksum; không commit dữ liệu hạn chế (BR-12).
- Thực hiện theo `README.md` tại thư mục này, `eval/schemas.py`, `eval/rubric.py` và quy trình khóa bộ dữ liệu hiện có. TV1 + GV quản lý holdout; không tự thay nhãn hay mở khóa.
- Giảng viên chấm trực tiếp claim/quote/context/version, không lấy verdict của model làm nhãn chuẩn. Trường hợp bất đồng cần reviewer chuyên môn thứ hai phân xử; lưu danh tính reviewer và thời điểm.

## Các nhóm cần có trong bộ chuẩn

1. Diễn đạt lại đúng ý; claim tiếng Việt dựa trên quote tiếng Anh.
2. Quote thật nhưng không liên quan đến kết luận; câu ghép chỉ một nửa có chứng minh.
3. Đảo phủ định; đổi số liệu, đơn vị, ngưỡng, lượng từ hoặc dấu bất đẳng thức.
4. Bỏ điều kiện giới hạn; biến tương quan thành quan hệ nhân quả.
5. Suy luận đủ tiền đề và có nhãn, so với suy luận vượt căn cứ.
6. Nguồn mâu thuẫn: trình bày cả hai phía so với chọn một phía/che điều kiện.
7. Một claim dẫn nhiều nguồn nhưng có nguồn không hỗ trợ; nhiều claims cùng nguồn với quotes khác nhau.
8. Citation giả/ngoài context, quote giả/dịch, nguồn bị thu hồi/mất quyền trước và trong xử lý.
9. Prompt injection trong quote/context; verifier timeout/JSON/verdict thiếu hoặc trùng.

## Bản ghi chấm (schema, không phải dữ liệu thật)

Mỗi dòng trong file local cần: `case_id`, `dataset_version`, `run_id`, `model`, `prompt_version_or_code_sha`, `claim_id`, `claim`, `source_refs`, `source_version_ids`, `supporting_quotes`, `context_checksum`, `validator_verdict`, `emitted`, `teacher_label`, `teacher_reason`, `label_author`, `label_reviewer`.

`teacher_label` chỉ thuộc `supported | unsupported | contradicted | uncertain`. Supported nghĩa là **toàn bộ** claim được quotes chứng minh, mỗi nguồn gắn kèm thực sự góp phần, điều kiện/phạm vi không bị bỏ. Quote xuất hiện trong chunk chưa đủ để gán supported.

Không ghi nguyên prompt/draft học thuật vào log vận hành. Nếu cần lưu draft để GV chấm false accept/false reject, dùng một harness offline và dữ liệu local có kiểm quyền, không bật lưu draft bị loại trong chat sản phẩm.

## Báo cáo phải tách riêng

- **Citation coverage**: số ý học thuật được dẫn đủ căn cứ / số ý học thuật phát hành. Nhãn nguồn phải sát ý; không chỉ đếm một `[n]` trong toàn câu trả lời.
- **False accept**: số claim được phát hành nhưng GV đánh giá không được hỗ trợ; liệt kê lý do và nhóm lỗi.
- **False reject**: số claim đủ căn cứ nhưng bộ lọc loại; tránh đạt an toàn bằng cách từ chối mọi câu.
- **Answer completeness/accuracy**: chấm cùng rubric PRD hiện có. Cần kiểm cả phần thiếu sau lọc.
- **ACL/technical fail-closed**: không phát hành nội dung nguồn sai quyền hoặc draft chưa kiểm khi verifier lỗi.
- **Chi phí/latency**: đo tổng generator + verifier + retry, không chỉ lượt generator. Context gửi một lần cho mỗi nguồn, claims tối đa 24.
- Tách kết quả dev/holdout và kết quả test mock/live-provider; không gộp test mock vào accuracy thực tế.

Ngưỡng nghiệm thu phải theo PRD/release gate đã thống nhất và được chủ sản phẩm/GV xác nhận; tài liệu này không tự đặt một ngưỡng mới hay tuyên bố release đạt khi chưa có nhãn GV.

## Phạm vi của bản sửa

Gate mới áp dụng cho Academic Q&A và Learning explain dùng Academic. Các bộ sinh plan/quiz/flashcard/analogy có hợp đồng riêng; một proof có thật ở các công cụ đó chưa đồng nghĩa đã qua verifier entailment này. Không được báo cáo chúng đã được kiểm chứng ngữ nghĩa chỉ vì gate Academic đã chạy.
