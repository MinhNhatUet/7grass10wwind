# Knowledge Hub Core

Core retrieval độc lập cho FR-04 và BL-15/16/17, thực thi BR-01/02/03/07/10/13. Package core không import FastAPI, SQLAlchemy, LangGraph hoặc LLM; phần wiring Backend nằm riêng trong `src/services/knowledge_hub_database.py` và `src/api/documents.py`.

## Chạy trên terminal

Từ thư mục gốc repository:

```bash
python -m src.knowledge_hub.demo
python -m src.knowledge_hub.query "cây AVL"
pytest tests/knowledge_hub -q
ruff check src/knowledge_hub tests/knowledge_hub
```

Hoặc gọi trực tiếp từ Python:

```python
from src.knowledge_hub.query import search_query

response = search_query("cây AVL")
for item in response.items:
    print(item.title, item.snippet, item.locator, item.score)
```

Mặc định helper dùng fixture và course `ctdl`. Có thể truyền `filters`, `page`, `page_size`; hoặc inject đồng thời `hub` và `access` để chạy trên composition khác.

## Chạy trên database thật

Adapter SQLAlchemy nằm ở `src/services/knowledge_hub_database.py`. Nó đọc `DATABASE_URL`, resolve quyền từ user/membership/ACL thật, chỉ nạp chunk của current Published version đủ quyền rồi chạy vector + BM25.

```powershell
.\.venv\Scripts\python.exe -m src.services.knowledge_hub_database `
  "mô hình phát triển phần mềm" `
  --course SE101 `
  --user u_student `
  --page-size 5
```

Hoặc gọi từ Python:

```python
from src.services.knowledge_hub_database import search_database

response = search_database(
    "mô hình phát triển phần mềm",
    course_id="SE101",
    user_id="u_student",
)
```

Hybrid mode gọi embedding provider trong `.env`; vector query phải cùng số chiều với embedding đã lưu. Browse mode dùng query rỗng và không gọi provider. Schema hiện tại chưa có cột `topic` và `semester`, vì vậy adapter mặc định trả rỗng nếu caller yêu cầu hai filter này thay vì âm thầm bỏ qua.

## Section-based chunking từ MinerU

Parser giữ `paragraph_title/doc_title` cùng `level`, chunker duy trì hierarchy dạng `Chương > Mục > Tiểu mục` và không ghép nội dung qua ranh giới section. Section được lưu riêng trong `chunks.section` và được thêm vào embedding text nhưng không chèn vào source excerpt.

Tạo lại artifact từ JSON MinerU đã có, không chạy MinerU hoặc ghi đè chunk cũ:

```powershell
.\.venv\Scripts\python.exe scripts/rebuild_mineru_chunks.py
```

Kết quả mặc định nằm trong `artifacts/chunks_sectioned`. Muốn đưa vào database Published cần tạo/re-index version mới để giữ bất biến version và citation cũ; không thay trực tiếp chunk đang phục vụ.

## Boundary ổn định

Caller khởi tạo `KnowledgeHubAgent` bằng các implementation của `DocumentCatalog`, `VectorSearchStore`, `LexicalSearchStore`, `EmbeddingProvider`, `FusionStrategy` và `Reranker`. Caller phải resolve auth/ACL thành `AccessScope`; core không suy diễn quyền từ role hoặc dữ liệu client.

`search()` có hai nhánh:

- query rỗng: browse catalog, áp eligibility rồi paginate;
- query có text: vector + BM25 trong cùng eligibility scope, RRF/deduplicate, post-validation qua catalog, rerank, group theo version, tạo snippet/locator và paginate.

`resolve_source()` đọc lại version/chunk và kiểm tra quyền, Published/Withdrawn tại thời điểm gọi. `can_download` chỉ là data-level flag; endpoint Backend vẫn authorize lại trước khi trả nội dung hay tải tệp.

## Backend integration

Hai endpoint cùng dùng SQLAlchemy adapter, ACL thật và core pipeline:

- `GET /api/v1/documents`: browse khi `q` rỗng; hybrid search khi có `q` (giữ contract của trang Library).
- `GET /api/v1/knowledge-hub/search`: endpoint đầy đủ, có trace an toàn và citation nguồn chuẩn.

Kết quả hybrid có `citation` gồm document/version/chunk, section, locator trang chính xác theo `page_map` và quote nguyên văn. Mở nguồn qua `GET /api/v1/chunks/{chunk_id}/source`; endpoint này luôn authorize lại trạng thái Published/current và ACL tại thời điểm gọi. Knowledge Hub trong chat cũng dùng cùng pipeline, không còn dùng đường cosine-only cũ.
