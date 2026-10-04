# 78 — Dọn và đồng bộ tài liệu theo bản rà soát

## Yêu cầu
Người dùng dán bản rà soát tài liệu: nhiều nội dung lỗi thời, UAT lẫn giữa mẫu / kịch bản / kết quả, có liên kết hỏng, cách tổ chức chưa rõ. Người dùng yêu cầu: "trừ những file gốc của repo, còn lại thì bạn sửa hết; những file gốc ở thư mục gốc repo thì giữ nguyên".

Cách hiểu đã áp dụng:
- Giữ nguyên các file ở thư mục gốc repo: `README.md`, `ARCHITECTURE.md`…
- Giữ nguyên các file gốc của template: `docs/architecture_diagram.md` (Initial commit của template) và `docs/guide/` (CODEOWNERS bên ngoài).
- Không xóa tài liệu nào.

Liên quan BL-30 (cổng phát hành, bàn giao), BR-12.

## Đã làm

| File | Thay đổi |
|---|---|
| `docs/handover/huong_dan_chay.md` | Viết lại theo code:<br>• frontend gọi thẳng backend, cần `CORS_ORIGINS` (bỏ câu "proxy, không cần CORS");<br>• bỏ `npm run typecheck`, thay bằng `npx tsc --noEmit`;<br>• thêm mục Docker (có Dockerfile frontend; compose dùng Postgres, chưa kiểm chứng);<br>• retention đã có (job hằng ngày, xóa hội thoại xóa mềm quá 30 ngày);<br>• các biến `.env` mới: demo login, bảng giá, timeout;<br>• lưu ý `.env` cần restart;<br>• menu theo vai trò hiện tại; ví dụ câu hỏi SE101 thay ví dụ môn đồ thị;<br>• mã lỗi embedding đúng code (`EMBEDDING_RATE_LIMITED` / `EMBEDDING_UNAVAILABLE`);<br>• cách chạy UAT tự động. |
| `docs/documentions/PRD_v2_MVP_edu04.md` | Lên bản 2.1:<br>• model `gpt-4o-mini`;<br>• MVP-QA-02 theo D-72/D-73; thêm MVP-LA-06; MVP-QZ-02 thêm D-64/D-74; MVP-ADM-02 thêm D-65;<br>• kho vector có cộng điểm từ khóa (D-68);<br>• chất lượng mã thống nhất 24 test, CI frontend đã có lint + build; thêm dòng Quan sát; độ trễ đo thật;<br>• sửa kết luận hiện trạng;<br>• AI-3/4/5, UX-2, OP-0/5/9 cập nhật theo hiện trạng (AI-5: đã kiểm câu trích tồn tại, chưa kiểm ngữ nghĩa / nhiều đáp án đúng);<br>• AC-5b mới; sửa AC-7/8;<br>• truy vết D-63 → D-74. |
| `docs/documentions/mo_ta_du_an_hien_tai.md` | Cập nhật 03/10:<br>• demo login;<br>• observability;<br>• retrieval cộng điểm từ khóa;<br>• bước kiểm trích dẫn (D-66/70/73/74);<br>• khu admin 4 nhóm;<br>• menu frontend;<br>• biến cấu hình mới;<br>• mã lỗi embedding đúng (thay `EMBEDDING_QUOTA`);<br>• hạn chế: chưa kiểm ngữ nghĩa, độ trễ. |
| `docs/uat/uat_mvp.md` | Trạng thái "đã chạy tự động, chưa nghiệm thu"; thêm bảng **Kết quả các lượt chạy** (02/10, 03/10 `0933`, 03/10 `1025`). |
| `docs/uat/uat_mvp_report.md` | Ghi nổi bật **ĐÂY LÀ MẪU BÁO CÁO**, trỏ tới danh sách kết quả. |
| `docs/uat/uat_mvp_report_UAT_20261003.md` | Thêm §5: lượt bổ sung `UAT_20261003_1025` (D-73, D-74). |
| `docs/uat/release_gate.md` | Phạm vi SE101; dòng Dữ liệu thay "0/30 sách tạm" bằng tình trạng quyền sử dụng SE101 (`unknown`, chờ Q-09); dòng Chức năng / Vận hành / Bàn giao theo bằng chứng hiện có. **Vẫn MỞ.** |
| `docs/uat/uat_report.md` | Sửa câu "cả hai bộ chưa có kết quả". |
| `eval/results/report.md` | Độ trễ và chi phí theo lượt 03/10; liên kết các báo cáo UAT; action items D-72 → D-74. |
| `frontend/README.md` | Thay README mặc định của create-next-app bằng điểm vào cho EDU-04: chạy, CORS, lệnh kiểm tra, cấu trúc `src/`, prototype chờ xác nhận. |
| `docs/ui-completion-roadmap.md` | Đối chiếu code: 4 mục đã xong chuyển sang "Đã xong (lịch sử)"; còn mở: lưu hạn mức thật, thông báo, build Docker. |
| `docs/codebase-review-2026-09-27.md`, `docs/file-cleanup-review-2026-09-30.md` | `git mv` vào `docs/archive/reviews/`; thêm dòng "Báo cáo lịch sử"; chỉnh liên kết tương đối theo vị trí mới; 2 liên kết tới file đã gỡ đổi thành chữ "(đã gỡ ở D-63)". |
| `docs/documentions/milestone_01_edu04.md`, `.github/BRANCHING.md` | Sửa liên kết sai cấp thư mục. |
| `docs/work/61_frontend_sach_lint_tsc.md` → `61a_…` | Phân biệt với `61_uat_mvp.md`. Chỉ đổi số file log của mình; `61_uat_mvp.md` là thay đổi chưa commit của người khác nên giữ nguyên. |
| `docs/work/README.md` (mới) | Mục lục nhật ký công việc. |
| `docs/README.md` (mới) | Mục lục tài liệu. Ghi rõ `ARCHITECTURE.md` / `architecture_diagram.md` là file template, không phản ánh code; kiến trúc thật ở mô tả dự án §3 và PRD v2 §5. Ghi rõ `docs/guide/` là tài liệu đào tạo của template. |

## Không làm
- Không sửa `README.md`, `ARCHITECTURE.md` (thư mục gốc), `docs/architecture_diagram.md`, `docs/guide/`, theo yêu cầu.
- Không đổi tên thư mục `documentions`: nhiều tham chiếu, để sau.
- Không sửa `docs/plans/` (cục bộ, gitignore), dù còn ghi `npm run typecheck`.
- Không sửa nội dung các work log cũ.

## Kiểm tra
- Script dò liên kết Markdown tương đối trong repo (trừ `node_modules`, `.venv`, `backup`, `data`, `docs/guide`): trước sửa có 4 liên kết hỏng, sau sửa **0**.
- Dò chuỗi lỗi thời trong `docs` (trừ guide/archive/work): không còn "chưa thực thi", "0/30 nguồn", `npm run typecheck`, "ChromaDB" ngoài các file template được giữ nguyên.
- Không đổi code nên không chạy lại ruff/pytest.

## Commit / push (theo yêu cầu "commit và push lên nhánh")
- Pull fast-forward commit `05afe82` (Bình) trên `origin/ndmnhat` trước khi commit. Commit đó có log 70–74 trùng số với log chưa commit của mình, nên đổi số log của mình: 70 → 75, 71 → 76, 72 → 77, 73 → 78 (sửa tham chiếu trong báo cáo UAT 03/10 và mục lục `docs/work/README.md`).
- Không commit `frontend/next-env.d.ts` (file do `next dev` tự sinh).

## Lưu ý
- Các file `docs/uat/uat_mvp.md`, `uat_mvp_report.md`, `release_gate.md`, `uat_report.md` có sẵn thay đổi chưa commit của người khác (xem log 63). Mình chỉ **thêm và sửa dòng**, không revert phần của họ. Nên báo người đó trước khi commit.
- Chưa commit.
