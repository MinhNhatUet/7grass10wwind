# 53 — Làm sạch `ruff check .` toàn repo

## Bối cảnh
`ruff check src tests` (CI) đã sạch, nhưng `ruff check .` báo 104 lỗi: phần lớn nằm trong `.agents/` (skill AI vendored từ nhánh quanghung), phần còn lại trong `scripts/`.

## Đã làm
- `ruff.toml`: thêm `extend-exclude = [".agents"]`. Đây là code bên thứ ba, không phải code ứng dụng, nên không sửa tay.
- `ruff check scripts --fix`: tự sửa 13 lỗi (thứ tự import, cú pháp UP) trong `log_hook.py`, `log_manual.py`, `log_antigravity.py`, `submit_log.py`, `seed_courses.py`. Hành vi không đổi.
- `scripts/log_hook.py`: 2 lỗi N806 (`_PAYLOAD_KEYS`, `_LIFECYCLE_EVENTS` là hằng cục bộ) được tắt bằng `# noqa: N806`, không đổi tên biến. Đây là hook ghi log AI của template, nên giữ nguyên logic.

## Điều chỉnh sau (theo người dùng)
Để không động vào file của template (`log_hook.py` là hook chấm điểm, đồng bộ upstream), đã bỏ mọi sửa đổi trong `scripts/`, các file này giờ khớp HEAD. Thay vào đó, thêm `"scripts"` vào `extend-exclude`. CI chỉ lint `src/ tests/` nên không ảnh hưởng.

## Kết quả
- `ruff check .` → All checks passed!
- `pytest tests` → 27 passed.

## Chưa commit
Theo quy tắc, chỉ commit khi người dùng yêu cầu.
