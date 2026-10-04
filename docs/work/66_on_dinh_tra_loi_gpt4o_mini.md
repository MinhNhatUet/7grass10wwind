# 66 — Đổi model sang gpt-4o-mini: backend không nhận model mới, trả lời thiếu căn cứ và trả lời tiếng Anh (D-68)

## 1. "Đổi model ở .env mà backend không đổi"
- `get_settings()` được cache (lru_cache) và chỉ đọc `.env` một lần lúc khởi động. `--reload` chỉ theo dõi file `.py`, không theo dõi `.env`.
- Lúc kiểm tra có **2 backend cùng chạy ở cổng 8000** (một khởi động 22:16, một 22:50). Sau khi người dùng khởi động lại lúc 22:56 chỉ còn một; `/admin/costs` xác nhận model đang dùng là `gpt-4o-mini`.
- Đã khuyên người dùng cập nhật bảng giá trong `.env` theo model mới.

## 2. Chất lượng trả lời sau khi đổi model
Người dùng báo: "mô hình xoắn ốc" và câu "Design" bị báo không đủ căn cứ; câu "Coupling" trả lời bằng tiếng Anh.

### Chẩn đoán
- Router vẫn chọn đúng SE101 / academic và có trả `search_terms`. Trace lưu trong tin nhắn không chứa trường này nên lúc đầu đọc nhầm là None.
- **Cohesion:** cả 6 chunk truy xuất được đều dưới ngưỡng 0,55, dù 2 chunk có chữ "cohesion". Nguyên nhân là chunk lớn (khoảng 2.000 ký tự, nhiều trang) làm embedding loãng một khái niệm nhỏ.
- **Xoắn ốc, Design:** truy xuất đủ (6 đoạn qua ngưỡng). Lỗi do `gpt-4o-mini` lúc trả lời lúc từ chối với cùng nguồn; khi thì bỏ sót định nghĩa nằm giữa chunk dài, khi thì chép nguyên văn nguồn tiếng Anh.

### Đã làm
1. `retrieval._keyword_bonus`: chunk chứa đúng thuật ngữ **hiếm** của truy vấn được cộng tối đa 0,1 điểm. Độ hiếm là log(N/df) chuẩn hóa ≥ 0,5, chỉ tính trên các chunk người dùng được phép đọc. Ngưỡng bằng chứng không đổi; thứ hạng của câu không có thuật ngữ hiếm (vd "Kiểm thử hộp đen") giữ nguyên.
2. `format_sources(hits, focus)`: với nguồn dài, đặt "đoạn liên quan nhất" (thuật toán D-66) lên đầu, toàn văn giữ nguyên bên dưới. Academic truyền `retrieval_query` làm `focus`.
3. `BASE_POLICY` quy tắc 7: luôn viết bằng tiếng Việt kể cả khi nguồn tiếng Anh, giữ thuật ngữ gốc trong ngoặc; chỉ `quotes` được chép nguyên văn.
4. Academic: định nghĩa lại `insufficient_evidence` là "chỉ khi không nguồn nào nói về điều được hỏi"; đặt `temperature=0`.

### Đo (5 câu, luồng thật router → truy xuất → academic, gpt-4o-mini)

| Lượt | Đạt | Từ chối sai | Trả lời tiếng Anh |
|---|---:|---:|---:|
| Trước sửa (×2) | 7/10 | 2 | 1 |
| Sau bonus + prompt (×2) | 9/10 | 1 | 0 |
| + temperature 0 (×3) | 13/15 | 2 (Cohesion) | 0 |
| + đoạn liên quan nhất (×3) | **15/15** | 0 | 0 |

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: đạt. `pytest`: 24 passed.
- UAT chạy lại: QA-02 **Pass** (câu ngoài kho vẫn bị từ chối, câu mơ hồ được hỏi lại), QA-06 **Pass**, QA-01 25/25 và QA-04 4/4 tiêu chí máy (Blocked vì chờ GV).
- Không thêm lượt gọi LLM hay embedding nào.

## Lưu ý
- Đây là cải thiện có đo nhưng mẫu nhỏ (5 câu); vẫn cần holdout (GATE-01) để có số đo độ chính xác.
- Hướng bền vững hơn là chia lại chunk theo trang/mục (PRD v2 AI-2) và rerank (AI-4).
- Chưa commit.
