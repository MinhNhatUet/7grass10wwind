# 34 — Hiển thị công thức kiểu LaTeX (KaTeX)

**Yêu cầu:** "các công thức ở sách do đã bị embedding nên hiện ko đẹp, hiện kiểu latex". Người dùng chọn KaTeX. **Quyết định:** D-40.

## Hiện trạng trước khi sửa
- Chunk trích từ PDF bị vỡ ký hiệu, vd. `∑n | i=1 mi`, `d( v) + d(w) n` (mất dấu ≥).
- Câu trả lời lưu trong DB trộn LaTeX thô (`$G$`, `∑_{i=0}^{n}`) với chữ thường; UI không render nên hiện nguyên ký tự.

## Thay đổi
- Frontend: `npm install katex remark-math rehype-katex`.
  - `components/math-text.tsx`:
    - plugin dùng chung;
    - `mathDelims` đổi `\(…\)` / `\[…\]` sang `$…$` / `$$…$$`;
    - component `M` render inline; không có ký hiệu công thức thì trả chữ thường, không chạy markdown.
  - `app/layout.tsx`: import `katex.min.css`.
  - `app/page.tsx`: ReactMarkdown của chat thêm `remark-math` + `rehype-katex`.
  - `learning-cards.tsx`: bọc `M` cho câu hỏi tự luận/trắc nghiệm, phương án, giải thích, flashcard, điền khuyết (câu, gợi ý, đáp án), lộ trình, thẻ Giải thích.
- Backend (`src/services/assistants/__init__.py`):
  - `BASE_POLICY` thêm quy tắc 8: công thức viết bằng LaTeX; khôi phục ký hiệu PDF bị vỡ theo ngữ cảnh nguồn, không thêm nội dung; trong JSON viết backslash đôi.
  - `_latex_safe()` trong `call_json`:
    - nhân đôi backslash của các lệnh LaTeX mà JSON hiểu nhầm thành escape hợp lệ (`\frac`, `\binom`, `\times`, `\neq`, `\text`…);
    - nhân đôi mọi backslash không phải escape JSON hợp lệ (`\sum`, `\cdot`, `\leq`…);
    - không đụng tới `\n`, `\t`, `\"`, `\`, `\uXXXX` đúng chuẩn.
- Không sửa chunk trong kho. Muốn xem công thức gốc thì mở ảnh trang (D-31).

## Kiểm tra
- Self-check `_latex_safe` với 7 trường hợp (gồm `\n` / `\t` / `\"` / `\` / `é` hợp lệ, `\frac` đã escape đúng): đều đạt.
- ruff sạch; `tsc` sạch; ESLint sạch ở `math-text.tsx`, `learning-cards.tsx`, `layout.tsx`.
- Edge headless ở cổng 3000, hội thoại "chu trình hamilton" có sẵn: 7 công thức render bằng KaTeX ($G$, $n \ge 3$, $d(v)+d(w) \ge n$…), không còn `$…$` thô.
- Chưa thử thẻ trắc nghiệm mới sinh vì LLM vilao đang chập chờn (log 33). Thẻ dùng cùng component `M` với chat.
