# PROJECT BRIEF — EDU-04

## 1. Thông tin dự án và nhóm thực hiện

| Nội dung | Thông tin |
|---|---|
| Mã dự án | EDU-04 |
| Nhóm lĩnh vực | A · AI Giáo dục |
| Tên dự án | Kho tri thức hỗ trợ học thuật X — Bộ trợ lý học thuật & học tập AI |
| Đơn vị thụ hưởng | Viện Trung tâm hỗ trợ học thuật X, gọi tắt là Trung tâm X |
| Tên nhóm | **7 cỏ 10 gió** |
| Giảng viên hướng dẫn | [Tự điền] |
| Đại diện Trung tâm X | [Tự điền] |
| Thời gian thực hiện | [Ngày bắt đầu] – [Ngày kết thúc] |
| Phiên bản tài liệu | 2.0 — 23/09/2026 (đồng bộ tên nhóm/thành viên và số liệu nghiệm thu theo PRD v2.0) |

| STT | Họ và tên | Mã sinh viên | Vai trò chính dự kiến |
|---|---|---|---|
| 1 (TV1) | Ngô Đinh Minh Nhật | [TỰ ĐIỀN MSV] | Điều phối, BA, kiểm thử và đánh giá |
| 2 (TV2) | Ngụy Quang Hùng | [TỰ ĐIỀN MSV] | Backend, xác thực, phân quyền, dữ liệu |
| 3 (TV3) | Nguyễn Văn Việt | 2A202602904 | AI/RAG, ingestion, routing, đánh giá AI |
| 4 (TV4) | Đinh Văn Bình | [TỰ ĐIỀN MSV] | Frontend, UX/UI, tích hợp, triển khai |

Phân công trên là gợi ý cho nhóm bốn người. Mỗi đầu việc cần một người chịu trách nhiệm và một người kiểm tra chéo; cả nhóm cùng chịu trách nhiệm chất lượng sản phẩm.

## 2. Tóm tắt điều hành

Trung tâm X có nhiều giáo trình, slide, đề cương và tài liệu tham khảo nhưng tài liệu phân tán, khó tra cứu và khó xác định phiên bản đáng tin cậy. Sinh viên mất thời gian tìm nội dung phù hợp; giảng viên phải trả lời lặp lại những câu hỏi nền tảng và khó quản lý tài liệu đang được sử dụng.

EDU-04 đề xuất một ứng dụng web có ba không gian liên thông: **Academic Assistant** trả lời câu hỏi chuyên môn theo môn học; **Learning Assistant** giải thích khái niệm và đề xuất lộ trình ôn tập; **Knowledge Hub** tìm kiếm, xem và tổng hợp tài liệu đã được duyệt. Hệ thống chỉ sử dụng nội dung thuộc kho Trung tâm X mà người dùng được phép truy cập để tạo câu trả lời học thuật, kèm nguồn kiểm chứng.

Giá trị cốt lõi là giúp người học tìm đúng tài liệu và hiểu nội dung nhanh hơn, đồng thời để giảng viên kiểm soát chất lượng nguồn. Đây là công cụ hỗ trợ học tập, không thay thế giảng viên, không chấm điểm chính thức và không cung cấp đáp án cho bài tập đang tính điểm.

## 3. Bối cảnh, vấn đề và cơ hội

| ID | Ai gặp? | Việc bị cản trở | Hậu quả trực tiếp | Ưu tiên sản phẩm đề xuất |
|---|---|---|---|---|
| PP-01 | SV | Tìm đúng trang/slide chứa khái niệm cần học | Dành thời gian mở và dò file thay vì học | Cốt lõi cơ bản |
| PP-02 | SV, GV | Xác định tài liệu/phiên bản đang áp dụng | Học hoặc hướng dẫn theo nội dung cũ | Cốt lõi cơ bản |
| PP-03 | SV | Kiểm chứng một lời giải thích hoặc kết luận | Tin nhầm hoặc phải tự tìm lại toàn bộ bằng chứng | Cốt lõi cơ bản |
| PP-04 | SV | Hiểu bước suy luận từ định nghĩa đến ví dụ | Đọc lại nhưng vẫn không tự giải thích được | Cốt lõi cơ bản |
| PP-05 | SV | Chọn thứ tự ôn phù hợp với thời gian còn lại | Bỏ sót phần cần học hoặc lập kế hoạch quá sức | Cơ bản, triển khai gọn |
| PP-06 | GV | Trả lời nhiều lần câu hỏi đã có trong học liệu | Lặp công việc tra nguồn, ít thời gian cho câu hỏi sâu | Giá trị cần kiểm chứng của hai trợ lý |
| PP-07 | GV/người duyệt | Biết tài liệu nào đã được kiểm tra và đang được phục vụ | Bản chưa kiểm tra hoặc trích xuất lỗi bị sử dụng | Kiểm soát bắt buộc cơ bản |
| PP-08 | SV, GV, quản trị | Được cấp đúng quyền và giữ nội dung hạn chế đúng phạm vi | SV thiếu nguồn cần học hoặc đáp án GV bị lộ | Kiểm soát bắt buộc cơ bản |
| PP-09 | GV và SV học hợp lệ | Nhận hỗ trợ học tập mà không để AI làm thay bài tính điểm | Lộ lời giải, hoặc câu hỏi học hợp lệ bị chặn quá mức | Kiểm soát bắt buộc cơ bản |
| PP-10 | Người vận hành, SV | Duy trì phản hồi ổn định trong ngân sách | Chờ lâu, gửi lại nhiều lần, gián đoạn hoặc tăng chi phí | Đo/hạn mức cơ bản; tối ưu nâng cao |

Đây là mô tả vấn đề từ đề bài, chưa phải kết quả khảo sát thực địa. Nhóm cần phỏng vấn tối thiểu đại diện sinh viên, giảng viên và người quản lý kho để xác nhận hành vi, môn ưu tiên và tiêu chí thành công.

**Pain point cụ thể ưu tiên:** SV có câu hỏi nhưng không biết nội dung nằm ở file/trang nào (PP-01); không chắc bản nào đang áp dụng (PP-02); có lời giải thích nhưng không mở được đoạn nguồn để kiểm chứng từng ý (PP-03); đọc định nghĩa nhưng chưa hiểu bước suy luận để tự giải thích lại (PP-04). Khi ôn tập, SV còn khó chia nội dung thành các buổi vừa quỹ thời gian thật (PP-05).

Ở phía GV, cần xác minh mức độ lặp lại việc chỉ nguồn/giải thích nền tảng (PP-06). Duyệt đúng bản trích xuất (PP-07), cấp/thu hồi đúng quyền (PP-08), hỗ trợ mà không làm thay bài tính điểm (PP-09) và duy trì dịch vụ trong ngân sách (PP-10) là các yêu cầu kiểm soát đi kèm. Không mặc định các sự cố này đã xảy ra tại Trung tâm X.

Bảng PP-01…PP-10 ở trên là bản đầy đủ nhất của phân tích pain point trong bộ tài liệu — [PRD mục 3](PRD_edu04.md) (Đối tượng mục tiêu & Chân dung người dùng, persona và jobs-to-be-done) xây dựng tiếp trên các pain point này nhưng không nhắc lại từng mã PP; PRD v2.0 không còn mục "2.4/#pain-points" riêng như bản trước. Kế hoạch xác thực (phỏng vấn/quan sát ngày 1–2) do nhóm thực hiện theo BL-01 trong [backlog](backlog_edu04.md). Chưa có baseline nên chưa cam kết tỷ lệ tiết kiệm thời gian hoặc giảm khối lượng hỗ trợ GV.

## 4. Mục tiêu và cách đo

| Mục tiêu | Chỉ tiêu nghiệm thu | Bằng chứng |
|---|---|---|
| Trả lời học thuật chính xác | ≥80% trên bộ hỏi đáp có nhãn đã khóa; **100 mẫu holdout chia đều 5 nhóm ×20 mẫu, cần ≥80/100 mẫu đạt đủ rubric** | Bộ test, đáp án tham chiếu, nguồn, phiếu chấm, báo cáo |
| Có thể kiểm chứng thông tin | Mọi khẳng định học thuật đưa ra phải có nguồn hỗ trợ; kiểm thử nguồn mở đúng trang/slide và đúng quyền | Báo cáo kiểm tra trích dẫn |
| Bảo vệ tài liệu | Không có ca lộ nội dung trái quyền trong bộ kiểm thử bảo mật đã thống nhất | Test truy cập trực tiếp, tìm kiếm, hội thoại, cache |
| Giữ liêm chính học thuật | Không cung cấp lời giải/đáp án bài tính điểm trong bộ kiểm thử nghiệm thu | Test trực tiếp, diễn đạt lại và yêu cầu nhiều lượt |
| Có sản phẩm sử dụng được | Web triển khai được, có tài khoản SV/GV, hỏi đáp và tìm tài liệu thật | URL môi trường demo, kịch bản UAT, hướng dẫn |
| Kiểm soát nguồn | Chỉ phiên bản đã duyệt và phát hành mới tham gia tìm kiếm/RAG | Nhật ký duyệt, test tài liệu chờ duyệt/thu hồi |
| Kiểm soát vận hành | Đo độ trễ p50/p95, token và chi phí theo yêu cầu; có hạn mức cấu hình | Dashboard/log và báo cáo tải |

**Cách hiểu KPI:** độ chính xác là tỷ lệ câu trả lời đạt rubric do người chấm xác nhận, không phải lấy điểm faithfulness của RAGAS làm "80% chính xác". Chi tiết cách lấy mẫu, chấm và phân biệt các chỉ số nằm ở mục 13 PRD. Kết quả trên 100 câu vẫn là một bộ kiểm chứng có quy mô giới hạn theo 6 môn pilot, không đủ để khẳng định chất lượng mọi môn học ngoài phạm vi đã chọn.

## 5. Người dùng và bên liên quan

- **Sinh viên:** hỏi kiến thức, yêu cầu giải thích, lập kế hoạch ôn, tìm/xem tài liệu trong môn được cấp quyền.
- **Giảng viên:** có chức năng học thuật như SV trong phạm vi được cấp; đề xuất tài liệu, xem phản hồi và quản lý môn phụ trách.
- **Giảng viên được giao quyền duyệt:** duyệt/từ chối/thu hồi tài liệu trong môn phụ trách. Người tải lên không tự duyệt bản của mình.
- **Quản trị:** quản lý tài khoản, môn, phân công, cấu hình và giám sát; quyền quản trị kỹ thuật không mặc nhiên cấp quyền đọc mọi nội dung.
- **Đại diện Trung tâm X/giảng viên hướng dẫn:** thống nhất phạm vi, nguồn hợp lệ, bộ test, ngân sách và nghiệm thu.

Hai vai trò nghiệp vụ tối thiểu là SV và GV. Quyền duyệt là quyền bổ sung cho GV; quản trị là vai trò vận hành.

## 6. Giải pháp và trải nghiệm chính

| Thành phần | Người dùng muốn làm gì? | Kết quả mong đợi |
|---|---|---|
| Academic Assistant | “Theo tài liệu môn này, khái niệm A khác B thế nào?” | So sánh có căn cứ, nguồn gắn từng ý, nêu rõ giới hạn bằng chứng |
| Learning Assistant | “Tôi còn 5 ngày để ôn chương 1–3, hãy giúp tôi lập kế hoạch.” | Hỏi thông tin còn thiếu, chia buổi học, liên kết nguồn, bài tự luyện không tính điểm |
| Knowledge Hub | “Tìm slide về chủ đề X trong môn Y.” | Danh sách tài liệu đúng quyền, bộ lọc, đoạn trích và vị trí xuất hiện |
| Khu vực giảng viên | “Đưa giáo trình mới vào kho cho lớp học phần.” | Tải lên → xử lý → kiểm tra → duyệt → phát hành; xem lỗi và lịch sử |

Luồng điển hình: đăng nhập → chọn môn → chọn trợ lý hoặc chế độ tự động → đặt câu hỏi → hệ thống kiểm tra quyền và liêm chính → tìm nguồn hợp lệ → trả lời hoặc báo chưa đủ bằng chứng → người dùng mở nguồn, phản hồi chất lượng.

Khi thiếu tài liệu, hệ thống nói rõ chưa đủ cơ sở và gợi ý từ khóa hoặc liên hệ GV. Khi câu hỏi yêu cầu đáp án bài tính điểm, hệ thống chuyển sang giải thích khái niệm, gợi ý cách tiếp cận hoặc ví dụ khác, không giải chính bài được giao.

## 7. Phạm vi triển khai

### 7.1. Bản cơ bản — bắt buộc

- Web app triển khai bằng Docker trên môi trường demo/cloud được nhóm lựa chọn.
- Đăng nhập; vai trò SV/GV; cấp quyền theo môn; kiểm tra quyền phía máy chủ.
- Academic và Learning Assistant có hội thoại theo môn, trả lời có nguồn, từ chối khi không đủ căn cứ.
- Knowledge Hub tìm kiếm và xem tài liệu mẫu đã duyệt.
- Ingestion tối thiểu cho PDF có lớp văn bản và PPTX; PDF scan được nhận diện, thông báo rõ nếu chưa hỗ trợ OCR.
- HITL tối thiểu: GV có quyền duyệt kiểm tra nội dung và nguồn trước phát hành; có giao diện duyệt cơ bản hoặc quy trình quản trị có lưu vết tương đương.
- **Dashboard Giảng viên (Must theo PRD v2.0 mục 7.1.10):** quản lý tài liệu, hàng đợi duyệt, lịch sử quyết định, phản hồi và thống kê trong phạm vi môn phụ trách — phải hoàn tất cùng bản cơ bản cuối tuần 3, không đợi đến giai đoạn nâng cao.
- Chặn đáp án bài tính điểm; chỉ dùng nguồn đúng quyền; ghi nhận lỗi, token và độ trễ.
- Bộ kiểm chứng bắt buộc **100 mẫu có nhãn (5 nhóm ×20)**, đạt ≥80/100, kèm bộ kiểm thử an toàn riêng (≥40 ca).

### 7.2. Bản nâng cao

- Router thông minh qua LangGraph điều phối đủ ba trợ lý; cho người dùng chọn thủ công khi cần.
- Hybrid search BM25 + vector, kết hợp kết quả và reranker.
- OCR cho PDF scan, kiểm soát chất lượng trích xuất và truy vết về trang.
- RAGAS đánh giá faithfulness, answer relevancy, context precision; mở rộng bộ kiểm chứng vượt 100 mẫu bắt buộc và báo cáo theo môn/nhóm câu hỏi.
- Cache có phân quyền, vô hiệu hóa khi tài liệu thay đổi; semantic dedup có giám sát.
- Theo dõi chi phí/độ trễ và giới hạn tài nguyên theo người dùng, môn hoặc môi trường.

Ràng buộc chống bịa, phân quyền, HITL và liêm chính áp dụng cho cả hai mức; “cơ bản” không được bỏ những kiểm soát này.

### 7.3. Ngoài phạm vi đợt đầu

- Tự động giải bài thi/bài tập tính điểm; chấm điểm chính thức; phát hiện gian lận để kỷ luật SV.
- Tìm web công khai rồi sử dụng như nguồn học thuật mặc định.
- LMS hoàn chỉnh, điểm danh, thanh toán, quản lý đào tạo hoặc cấp chứng chỉ.
- Tích hợp SIS/LMS/SSO thật khi chưa có quyền truy cập và yêu cầu rõ ràng.
- Huấn luyện mô hình nền từ đầu; ứng dụng di động riêng; đảm bảo hiểu mọi ảnh, công thức, bảng phức tạp.

## 8. Định hướng kỹ thuật

Frontend Next.js kết nối backend FastAPI. Backend xác thực, kiểm tra phạm vi tài liệu và điều phối tác vụ AI. Kho gốc lưu file; PostgreSQL lưu tài khoản, môn, quyền, phiên bản và nhật ký. Lớp truy xuất vector chọn **một** phương án pgvector hoặc Qdrant sau thử nghiệm. Bản nâng cao bổ sung BM25, reranker và LangGraph router. Một worker xử lý file ngoài luồng hội thoại; cache và dịch vụ AI được giới hạn ngân sách.

Đây là kiến trúc mục tiêu, không phải xác nhận mã nguồn hiện tại đã triển khai. Chi tiết thiết kế, trạng thái tài liệu và hợp đồng API đề xuất nằm trong PRD.

## 9. Giả định, phụ thuộc và quyết định cần chốt

| Hạng mục | Giả định lập kế hoạch | Người cần xác nhận |
|---|---|---|
| Kho mẫu | 2 môn, 30–50 tài liệu hợp lệ, ưu tiên tiếng Việt | Trung tâm X + GV |
| Dữ liệu có nhãn | GV hoặc người được ủy quyền cung cấp/kiểm tra đáp án và nguồn | GV |
| Quyền sử dụng | Có quyền dùng và xử lý các file mẫu; không đưa dữ liệu nhạy cảm chưa được phép lên dịch vụ AI | Trung tâm X |
| Lịch | **6 tuần; bản cơ bản phải hoàn tất cuối tuần 3** — ràng buộc nhóm đã xác nhận | Nhóm; GV xác nhận lịch nghiệm thu cụ thể |
| Môi trường | Có nơi chạy Docker và khóa dịch vụ AI phù hợp | Nhóm |
| Ngân sách | [Tự điền hạn mức tổng], [hạn mức/tháng], [hạn mức/ngày] | Nhóm + người tài trợ |
| Xác định bài tính điểm | GV gắn nhãn và cung cấp danh mục; AI chỉ là lớp phát hiện bổ sung | GV |
| Duyệt độc lập | Có người duyệt khác người tải tài liệu lên | Trung tâm X |

Ngoài thời hạn 6 tuần và mốc cơ bản cuối tuần 3 do nhóm xác nhận, các thông số quy mô/ngân sách trên vẫn là giả định cần thống nhất. Nếu thiếu người duyệt độc lập, GV hướng dẫn có thể được phân công duyệt; không tự động công bố để bỏ qua HITL.

## 10. Lộ trình đề xuất và phân công

| Giai đoạn | Tuần | Kết quả bàn giao | Phụ trách chính |
|---|---|---|---|
| Chốt phạm vi và nền tảng chạy được | 1 | Chốt yêu cầu ngày 1–2; auth/ACL, upload → preview → duyệt → index một file mẫu; app chạy trên môi trường demo; chuẩn bị nhãn song song | TV1 nghiệp vụ/nhãn; TV2 nền tảng; TV3 ingestion; TV4 UI/deploy |
| Hoàn tất luồng chức năng cơ bản | 2 | Hub/xem nguồn; Academic + Learning; citation, guardrails, lịch sử, phản hồi và thu hồi; bắt đầu Dashboard GV (Must); chạy thử trên dev | Cả nhóm tích hợp mỗi ngày |
| Kiểm chứng và nghiệm thu cơ bản | 3 | Đóng tính năng mới; hoàn tất Dashboard GV; sửa lỗi; **≥80/100 mẫu holdout đạt (5 nhóm ×20)**; safety/UAT, quota, backup/restore, hướng dẫn và demo | TV1 điều phối; cả nhóm sửa và kiểm chứng |
| Nâng cao đợt 1 | 4 | Sau cổng cơ bản: ưu tiên router và hybrid/reranker; mở rộng dashboard vận hành/quota (nâng cao) song song | TV3 AI; TV2 hỗ trợ retrieval; TV4 dashboard vận hành; TV1 eval |
| Nâng cao đợt 2 | 5 | RAGAS, OCR/cache/dedup theo năng lực và phạm vi cam kết; chốt tính năng cuối tuần | Cả nhóm; không thêm tính năng vượt capacity |
| Ổn định và bàn giao cuối | 6 | Regression, đo lại chất lượng/chi phí/độ trễ, sửa lỗi, tài liệu và demo; không mở tính năng mới | Cả nhóm; TV1 tổng hợp |

Cuối tuần 3 là mốc nghiệm thu bản cơ bản, không chỉ là mốc viết xong code. Chỉ triển khai nâng cao sau khi cổng cơ bản đạt. Nếu có nguy cơ trễ, báo ngay trong tuần 1–2, giảm độ cầu kỳ giao diện và quy mô thử nghiệm theo thỏa thuận, không bỏ Must/kiểm soát an toàn hoặc tự hạ KPI. Nếu mốc bị lỡ phải ghi nhận trễ; tuần 4 ưu tiên khắc phục và giảm phần nâng cao, không đổi tên mốc để coi là đúng hạn. Lịch vẫn kết thúc tuần 6.

## 11. Rủi ro chính và ứng phó

| Rủi ro | Tác động | Biện pháp |
|---|---|---|
| File scan/công thức trích xuất sai | Trả lời sai dù nguồn đúng | Xem trước kết quả, đánh dấu lỗi, OCR và kiểm tra thủ công |
| Thiếu nguồn hoặc nguồn mâu thuẫn | Bịa hoặc chọn sai phiên bản | Từ chối có giải thích, hiển thị mâu thuẫn và phiên bản |
| Rò rỉ qua retrieval/cache/lịch sử | Lộ tài liệu ngoài môn | Lọc quyền trước truy xuất, kiểm tra lại trước phản hồi, test thu hồi |
| Lách guardrails qua nhiều lượt | Cung cấp đáp án tính điểm | Nhãn GV, kiểm tra lịch sử hội thoại, kiểm thử tấn công |
| Bộ test quá nhỏ hoặc bị dùng để tinh chỉnh | Kết quả KPI thiếu tin cậy | Khóa holdout, tách dev/test, báo giới hạn, mở rộng ở bản nâng cao |
| API chậm hoặc chi phí tăng | Demo gián đoạn, vượt ngân sách | Hạn mức, timeout, retry hữu hạn, cache đúng quyền, theo dõi token |
| Scope quá lớn | Không hoàn thành bản sử dụng được | Chốt Must/Should/Could, có cổng nghiệm thu bản cơ bản |

## 12. Điều kiện hoàn thành

1. Mã nguồn, cấu hình mẫu không chứa bí mật, hướng dẫn chạy local/Docker và triển khai.
2. Web demo có tài khoản theo vai trò, kho tài liệu mẫu được phép sử dụng và ít nhất hai môn theo phạm vi đã chốt.
3. Hai trợ lý có nguồn; Hub tìm kiếm đúng quyền; quy trình duyệt và thu hồi kiểm chứng được.
4. Bộ test có nhãn, rubric và báo cáo độ chính xác; kiểm thử phân quyền, citation và liêm chính.
5. Với mức nâng cao: bằng chứng router ba trợ lý, hybrid/reranker, RAGAS, dashboard vận hành/quota và tối ưu đã thực hiện (Dashboard Giảng viên là Must, đã tính ở bản cơ bản).
6. Brief, PRD, tài liệu thiết kế, hướng dẫn người dùng, vận hành và danh sách hạn chế còn lại.
7. Biên bản UAT; không còn lỗi chặn phát hành như lộ tài liệu, tự công bố nguồn chưa duyệt hoặc trả đáp án bài tính điểm trong bộ nghiệm thu.
