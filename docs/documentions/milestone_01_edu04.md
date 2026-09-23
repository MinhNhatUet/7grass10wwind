# EDU-04 — MỐC 1: CHỐT BÀI TOÁN VÀ THIẾT KẾ

**Bộ bàn giao:** one-page brief, PRD, wireframe/UI flow và GitHub repo setup.  
**Lịch:** 6 tuần; cơ bản hoàn tất cuối tuần 3. Chốt phạm vi/thiết kế nền ngày 1–2 tuần 1, tiếp tục bổ sung chi tiết cùng triển khai.  
**Trạng thái:** bộ tài liệu và cấu hình local đã chuẩn bị; xác nhận nghiệp vụ và kiểm chứng thiết lập GitHub còn các mục bên dưới. Không coi "có file" là "đã được GV phê duyệt".
**Cập nhật 23/09/2026:** PRD, Wireframe & UI flow và Backlog đã đồng bộ lên v2.0 — điểm đổi chính cần các thành viên nắm: bộ nghiệm thu accuracy dùng **100 mẫu holdout / 5 nhóm ×20 / ngưỡng ≥80/100** (không còn 30 câu/≥24); Dashboard Giảng viên (UI-09) là **Must**, phải xong cùng bản cơ bản cuối tuần 3.

## 1. Bộ hồ sơ để review và nộp

| Đầu ra | Tài liệu | Nội dung kiểm tra |
|---|---|--
| PRD | [PRD_edu04.md](PRD_edu04.md) (v2.0) | FR/BR, ACL, HITL, citation, liêm chính, dữ liệu/API, NFR và nghiệm thu |
| Wireframe | [wireframe&UIflow_edu04.md](wireframe&UIflow_edu04.md) (v2.0) | Màn hình UI-01…UI-10, flow, quyền, trạng thái rỗng/lỗi và nhánh thu hồi |
| Phân tích hỗ trợ | [brief_edu04.md](brief_edu04.md) mục 3 | Bảng pain point PP-01…PP-10; phân biệt giả thuyết với bằng chứng, kế hoạch xác thực |
| Kế hoạch thực thi | [backlog_edu04.md](backlog_edu04.md) (v2.0) | 40 hạng mục, phụ thuộc, owner, AC và lịch 6 tuần |
| Brief đầy đủ | [brief_edu04.md](brief_edu04.md) | Thông tin nhóm và diễn giải mở rộng; không thay bản một trang |

**Lưu ý:** không có file `pain_points_edu04.md` riêng trong repo — nội dung pain point (PP-01…PP-10) nằm ở [brief_edu04.md](brief_edu04.md) mục 3. PRD_edu04.md bản v2.0 hiện tại không còn mục "#pain-points" riêng như một số bản backlog cũ từng trỏ tới; đã sửa các liên kết đó sang brief.


## 2. Nội dung cần xác nhận để chốt bài toán

- [x] Xác định luồng giá trị: tìm nguồn → hiểu kiến thức → kiểm chứng.
- [x] Phân biệt Academic, Learning và Hub; cơ bản chọn trợ lý thủ công.
- [x] Ghi mốc cứng: cơ bản cuối tuần 3, bàn giao cuối tuần 6.
- [x] Định nghĩa accuracy ≥80%: bộ holdout **100 mẫu chia đều 5 nhóm ×20**, tối thiểu 80/100 câu đạt đủ 4 tiêu chí rubric (PRD mục 13.1–13.4); safety và RAGAS tách riêng.
- [x] Thiết kế ACL, duyệt độc lập, thu hồi và chặn đáp án tính điểm.
- [ ] Điền tên nhóm, 4 thành viên/MSV và người chịu trách nhiệm.
- [ ] Xác nhận môn pilot, nguồn được phép sử dụng/xử lý bằng AI.
- [ ] Phân công người duyệt khác uploader và người kiểm tra nhãn/đáp án.
- [ ] Ghi kết quả xác thực pain point, không dùng ví dụ giả định như phỏng vấn thật.
- [ ] Chốt ngân sách, ngưỡng vận hành/retention và phạm vi nâng cao.
- [ ] Nhóm/GV walkthrough và ghi quyết định chấp thuận hoặc chỉnh sửa.

## 3. GitHub repo setup — trạng thái kiểm tra

Remote được cấu hình trong local: [AI20K-Build-Phase-Cohort-4/P-134](https://github.com/AI20K-Build-Phase-Cohort-4/P-134). Đây là giá trị `git remote`, chưa phải bằng chứng đã kết nối/đọc được cấu hình GitHub server.

| Hạng mục | Kết quả local | Việc còn lại |
|---|---|---|
| Repository và remote | Có Git repository; `origin` trỏ về repo trên; đang ở nhánh local `main` | Xác minh remote truy cập được và nhánh mặc định trên GitHub |
| Quyền 4 thành viên | Chưa kiểm chứng | Người có quyền tổ chức/repo kiểm tra membership và quyền phù hợp |
| GitHub CLI | Không tìm thấy `gh` trong PATH tại lần kiểm tra | Dùng giao diện GitHub hoặc môi trường có công cụ đã xác thực |
| CI | Có workflow Python 3.11, ruff và pytest; bổ sung PR vào `develop` | Chạy trên GitHub sau khi thay đổi được đưa lên; chưa khẳng định CI xanh |
| Quy ước nhánh | Thêm [BRANCHING.md](../.github/BRANCHING.md) | Thống nhất workflow và kiểm tra/tạo `develop` nếu áp dụng |
| PR template | Đã có; giữ các chỉnh sửa đang tồn tại | Review nội dung theo workflow nhóm |
| Issue templates | Thêm story và bug templates | Xuất hiện sau khi nằm trên nhánh phù hợp của GitHub; chưa tạo issue thật |
| CODEOWNERS | Có file nhưng đang tham chiếu team `AI20K-Build-Phase/book-maintainers` của template | Xác minh owner có quyền trong repo hiện tại và yêu cầu tổ chức trước khi sửa |
| Branch protection/ruleset | Chưa kiểm chứng | Đề xuất PR review, required CI, không force push nhánh quan trọng; không ghi đã bật |
| Milestones/board | Backlog local đã có | Tạo mốc cơ bản tuần 3/cuối tuần 6 và board nếu nhóm chọn quản lý trên GitHub |
| Secret hygiene | `.env` được ignore và không có trong danh sách file tracked tại kiểm tra này | Không coi đây là kiểm tra toàn lịch sử; review diff từng commit trước push |

`CODEOWNERS` định tuyến review theo quyền/thiết lập GitHub; sự tồn tại của file không tự chứng minh có bắt buộc review hoặc branch protection. Không đổi tên owner bằng tài khoản giả hoặc bỏ quy tắc template để vượt chính sách tổ chức.

## 4. Trình tự hoàn tất repo setup

1. Đại diện nhóm kiểm tra quyền truy cập repo và quy định nhánh của tổ chức.
2. Phân loại thay đổi local theo task; repository hiện có thay đổi sẵn ngoài bộ tài liệu, tránh gom tất cả vào cùng commit.
3. Review diff của tài liệu, issue templates, branching và CI; commit trên nhánh công việc phù hợp rồi mở PR theo quy định đã thống nhất.
4. Kiểm tra lần chạy CI thật, sửa lỗi nếu có; cấu hình required checks theo tên job thực tế của workflow.
5. Xác minh CODEOWNERS và ruleset; tạo milestones/board, đưa backlog ưu tiên lên issue và gán owner khi nhóm chọn dùng.
6. Ghi URL PR/CI/milestone/board và người kiểm tra vào bảng bằng chứng, rồi mới đánh dấu repo setup hoàn tất.

Không có commit/push, tạo issue, đổi quyền thành viên hoặc cấu hình server được thực hiện chỉ từ việc tạo tài liệu này. Các bước local đã chuẩn bị không thay cho bằng chứng server.

## 5. Checklist nghiệm thu thiết kế

Walkthrough ba kịch bản: SV hỏi → mở nguồn → phản hồi; GV upload → GV khác duyệt → SV tìm được; thu hồi → nguồn/cache/lịch sử ngừng phục vụ. Xem cả ca chưa có nguồn, mất quyền, lỗi index và bài tính điểm.

| Điều kiện | Bằng chứng/ghi chú |
|---|---|
| Brief, PRD, flow và backlog thống nhất lịch/phạm vi | [Người review/ngày] |
| Có owner và quyết định cho các mục còn mở chặn triển khai | [Decision log] |
| Công nghệ thực thi được chốt hoặc có spike có hạn thời gian | PRD định hướng Next.js; requirements hiện có Streamlit từ template. Cần xác nhận lựa chọn, không coi hai thứ là cùng một implementation |
| Repo có quyền/nhánh/CI được kiểm tra thực tế | [URL bằng chứng, chưa điền] |
| Nhóm/GV xác nhận mốc thiết kế | [Tên/ngày/điều kiện chấp thuận] |

Mốc này không yêu cầu sản phẩm đã đạt accuracy; đó là cổng bản cơ bản cuối tuần 3. Nó yêu cầu cách đo và nguồn/nhãn chuẩn bị phải rõ để đội có thể triển khai và kiểm chứng đúng hạn.
