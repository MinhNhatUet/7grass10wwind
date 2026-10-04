# D-71 — Khôi phục stash và xử lý xung đột

## Thực hiện
- `git stash apply --index` không thành công vì upstream đã xóa `study-launcher.tsx`; tiếp tục bằng `git stash apply`.
- Khôi phục thay đổi `.gitignore`, `frontend/src/app/theme.css`, `requirements.txt` và các log local 54/55.
- Xung đột modify/delete duy nhất ở `frontend/src/components/study-launcher.tsx`: giữ việc xóa của upstream vì D-63 đã chủ động loại bỏ giao diện cũ và các dependency của component.
- Trước khi xóa, sao lưu bản local tại `backup/stash_restore_2026-10-03/study-launcher.tsx` (gitignored).
- Notebook `TRAIN_COLAB_DATASET_V3.ipynb` không khôi phục vào working tree/index; bản add nhầm trước đây vẫn được bảo toàn trong stash.
- Giữ nguyên `stash@{0}` để dự phòng; không commit/push.

## Kiểm tra
- `git ls-files -u`: không còn đường dẫn xung đột.
- `git diff --cached --check`: pass.
- `git check-ignore -v`: rules local và bản backup đều được bỏ qua.
- Không chạy test ứng dụng: không bổ sung code mới, chỉ khôi phục thay đổi local và giải quyết trạng thái Git.
