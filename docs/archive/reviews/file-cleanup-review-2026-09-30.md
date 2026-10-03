# Review các file có thể xóa khỏi dự án

> **Báo cáo lịch sử (lưu trữ 2026-10-03), không phải hiện trạng.** Nhiều mục đã được xử lý sau ngày rà soát; hiện trạng xem [mô tả dự án hiện tại](../../documentions/mo_ta_du_an_hien_tai.md) và [PRD v2](../../documentions/PRD_v2_MVP_edu04.md).

Ngày review: 2026-09-30.

## Phạm vi và kết quả

- Rà soát cấu trúc dự án, file được Git theo dõi, tham chiếu trong mã nguồn, script và CI.
- Kiểm tra TypeScript bằng `tsc --noEmit --incremental false`: thành công.
- Chưa xóa hoặc sửa mã nguồn trong đợt review này.
- Đây là review phục vụ dọn file, chưa phải kiểm thử toàn bộ chức năng hoặc audit toàn bộ code.
- Working tree đang có nhiều thay đổi chưa commit. Các nhận định áp dụng cho trạng thái mã nguồn tại thời điểm review.

## 1. Có thể xóa khỏi ứng dụng hiện tại

Không tìm thấy tham chiếu sử dụng các mục dưới đây trong mã nguồn ứng dụng, script chạy hoặc CI. Việc không có tham chiếu không loại trừ nhu cầu dùng thủ công hoặc giữ làm tài liệu thiết kế.

| File/thư mục | Cơ sở đề xuất | Lưu ý |
|---|---|---|
| `frontend/luno-admin-dashboard/` | Giao diện HTML/CSS/JS mẫu chạy độc lập, không thuộc luồng Next.js hiện tại | Lưu bản riêng nếu còn dùng làm mẫu thiết kế |
| `frontend/paper-document-editor/` | Prototype độc lập, chưa kết nối backend | Lưu bản riêng nếu còn dùng làm mẫu thiết kế |
| `frontend/transform.js` | Script thay thế CSS trong `src/app/page.tsx`, không thuộc quy trình build | Không cần cho việc chạy frontend |
| `frontend/public/file.svg` | Asset mẫu, không tìm thấy nơi sử dụng | Có thể bỏ |
| `frontend/public/globe.svg` | Asset mẫu, không tìm thấy nơi sử dụng | Có thể bỏ |
| `frontend/public/next.svg` | Asset mẫu, không tìm thấy nơi sử dụng | Có thể bỏ |
| `frontend/public/vercel.svg` | Asset mẫu, không tìm thấy nơi sử dụng | Có thể bỏ |
| `frontend/public/window.svg` | Asset mẫu, không tìm thấy nơi sử dụng | Có thể bỏ |
| `frontend/public/hrment-logo.png` | Không tìm thấy nơi sử dụng | Có thể bỏ nếu không còn cần làm tài nguyên thiết kế |
| `src/agents/tools/example_tool.py` | Tool mẫu, không thấy được import hoặc đăng ký trong ứng dụng | Có thể bỏ nếu không còn cần ví dụ đào tạo |

## 2. Cache có thể dọn và tạo lại

Dừng server trước khi dọn cache đang được sử dụng.

| File/thư mục | Ghi chú |
|---|---|
| `frontend/.next/` | Next.js tạo lại khi chạy dev hoặc build |
| `frontend/tsconfig.tsbuildinfo` | Cache TypeScript; đang được Git theo dõi dù đã có quy tắc ignore |
| Các thư mục `__pycache__/` | Python tạo lại khi import module |
| `.pytest_cache/` | Cache của pytest |
| `.ruff_cache/` | Cache của Ruff |

Khi thực hiện dọn, nên bỏ `frontend/tsconfig.tsbuildinfo` khỏi Git tracking. Quy tắc ignore không tự loại bỏ file đã được theo dõi.

`frontend/node_modules/` và `.venv/` có thể tạo lại bằng cách cài thư viện, nhưng không nên xóa trong đợt dọn thông thường vì phải cài lại môi trường.

## 3. Cần sửa code trước khi xóa

### Nhóm backend mẫu

```text
src/api/routes.py
src/agents/graph.py
src/agents/state.py
src/agents/nodes/example_node.py
```

Nhóm này vẫn có chuỗi phụ thuộc:

```text
src/main.py
  -> src/api/routes.py
     -> src/agents/graph.py
        -> src/agents/state.py
        -> src/agents/nodes/example_node.py
```

`src/main.py` vẫn đăng ký router mẫu. `tests/test_agents/test_graph.py` import graph và `tests/test_api/test_routes.py` kiểm tra endpoint mẫu.

Muốn bỏ nhóm này cần:

1. Kiểm tra client còn gọi `/api/v1/chat` và `/api/v1/status` hay không.
2. Tháo import và đăng ký router mẫu khỏi `src/main.py`.
3. Cập nhật test liên quan; giữ các test health cần thiết.
4. Xóa các module mẫu không còn phụ thuộc.
5. Chạy lại kiểm tra backend và frontend phù hợp.

### Tài liệu mẫu và đào tạo

`README_boilerplate.md`, `docs/guide/` và các README mẫu có thể đưa ra khỏi repo sản phẩm nếu không còn cần tài liệu đào tạo. Đây không phải file rác mặc định. Nếu bỏ, cần rà soát và cập nhật liên kết trong README và các tài liệu liên quan.

## 4. Nên giữ

| File/thư mục | Lý do |
|---|---|
| `data/` | Chứa dữ liệu ứng dụng; không xử lý như cache |
| `.env` | Cấu hình môi trường và thông tin xác thực; không đưa nội dung vào báo cáo |
| `.git/` | Lịch sử và metadata của repository |
| `frontend/package-lock.json` | Khóa dependency, được CI sử dụng qua `npm ci` |
| `tests/`, `eval/` | Test, công cụ đánh giá và bằng chứng kiểm thử |
| Log và tài liệu bàn giao | Có giá trị vận hành hoặc phục vụ yêu cầu dự án |
| `frontend/public/profile-avatar.png` | Được trang profile sử dụng |
| `frontend/public/vedu-logo.png` | Được giao diện sử dụng |
| `frontend/src/components/source-reader.tsx` | Được trang chính import |
| `frontend/src/components/lecturer-dashboard.tsx` | Được `manage-hub.tsx` import |

Không xóa hàng loạt component theo tên cũ: cần phân biệt file đã bị xóa trong working tree với file hiện tại vẫn được import.

## 5. Phát hiện liên quan trong review

### Cấu hình URL backend trong tài liệu frontend chưa khớp code

- `frontend/.env.example` hướng dẫn `BACKEND_URL` và mô tả proxy rewrite.
- `frontend/next.config.ts` hiện không có cấu hình rewrite.
- `frontend/src/lib/api-errors.ts` và các lệnh fetch trong trang chính sử dụng `NEXT_PUBLIC_API_URL`, mặc định là `http://localhost:8000`.

Cấu hình phù hợp với code hiện tại trong `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Hướng dẫn trước đó sử dụng `BACKEND_URL` cần được điều chỉnh. Báo cáo này chỉ ghi nhận, chưa sửa file cấu hình hoặc tài liệu khác.

### Có nhiều thay đổi chưa commit

Các component cũ như `AppShell.tsx`, `StudyTools.tsx`, `useSession.ts` đã được đánh dấu xóa trong working tree. Kiểm tra TypeScript trên trạng thái hiện tại thành công. Điều này không thay thế kiểm thử điều hướng và chức năng bằng trình duyệt.

## 6. Thứ tự dọn đề xuất

1. Ghi nhận các thay đổi đang có để tránh trộn với đợt dọn file.
2. Xóa nhóm file độc lập trong mục 1 sau khi xác định không còn nhu cầu giữ prototype.
3. Dọn cache khi cần và bỏ cache TypeScript khỏi Git tracking.
4. Xử lý nhóm backend mẫu trong một thay đổi riêng vì cần sửa router và test.
5. Chạy kiểm tra TypeScript, lint/build frontend và test backend tương ứng với phạm vi thay đổi.

Không có thao tác xóa nào được thực hiện trong quá trình lập báo cáo này.
