# Architecture Diagram — EDU-04 Kho tri thức hỗ trợ học thuật X

Mô tả chi tiết từng thành phần: [ARCHITECTURE.md](../ARCHITECTURE.md).

## 1. Thành phần hệ thống

```mermaid
graph TB
    User([Sinh viên / Giảng viên / GV duyệt / Quản trị])
    User --> FE[Frontend Next.js<br/>chat, thư viện, lộ trình, quản lý tài liệu, admin]
    FE -->|REST /api/v1 + Bearer token| API[FastAPI backend]

    subgraph Backend[FastAPI backend — src/]
        API --> AUTH[Auth + ACL<br/>services/auth.py, services/acl.py<br/>BR-02: role/user lấy từ token + DB]
        API --> ORCH[LangGraph orchestrator<br/>agents/orchestrator.py]
        API --> DOCS[Vòng đời tài liệu<br/>services/documents.py]
        API --> LP[Lộ trình học<br/>services/learning_path/]
        API --> QUIZ[Đề trắc nghiệm GV<br/>services/course_quiz.py]
        ORCH --> AA[Academic Assistant<br/>hỏi đáp có trích dẫn]
        ORCH --> LA[Learning Assistant<br/>giải thích, tự kiểm tra, lộ trình]
        ORCH --> HUB[Knowledge Hub<br/>tìm tài liệu]
        AA & LA & LP --> RET[Retrieval lọc quyền trước<br/>services/retrieval.py]
        HUB --> HRET[Hybrid search<br/>vector + BM25 + RRF + rerank]
        DOCS --> JOBS[Job nền: trích xuất → chunk → embedding]
    end

    AA & LA & LP & QUIZ & ORCH --> LLM[LLM tương thích OpenAI<br/>get_llm, AI_*]
    RET & HRET & JOBS --> EMB[Embedding<br/>Gemini / OpenAI]
    Backend --> DB[(Postgres + pgvector<br/>bảng nghiệp vụ + cột embedding vector)]
    DOCS & JOBS --> FS[(Kho file riêng tư<br/>data/storage, theo sha256)]
```

## 2. Luồng hỏi đáp (data flow)

```mermaid
sequenceDiagram
    participant U as Người học
    participant API as FastAPI
    participant G as LangGraph
    participant R as Retrieval
    participant L as LLM
    participant DB as DB
    U->>API: POST /conversations/{id}/messages
    API->>API: xác thực token, quota, idempotency
    API->>G: policy → router
    G->>G: policy: yêu cầu lời giải bài tính điểm → chuyển hướng (BR-06)
    G->>L: router chọn MÔN (chỉ trong môn được đọc) + trợ lý
    G->>R: truy xuất trong phiên bản Published, đúng ACL (BR-01/03)
    R->>DB: chỉ chấm embedding của version được phép → top-k cosine pgvector
    R-->>G: đoạn nguồn (thiếu bằng chứng → báo không đủ căn cứ, BR-05)
    G->>L: sinh câu trả lời, nguồn là DỮ LIỆU không phải chỉ thị (BR-09)
    G-->>API: câu trả lời + [n]
    API->>DB: kiểm lại quyền nguồn, lưu message + citation (trang thật)
    API-->>U: câu trả lời, mỗi [n] mở được đúng trang nguồn (BR-04)
```

## 3. Vòng đời tài liệu

```mermaid
stateDiagram-v2
    [*] --> Processing: GV upload (có quyền môn)
    Processing --> Draft: trích xuất xong
    Processing --> NeedsReview: chất lượng trích xuất thấp
    Processing --> Failed
    Draft --> PendingApproval: GV gửi duyệt
    NeedsReview --> PendingApproval: GV xác nhận cảnh báo
    PendingApproval --> Rejected: GV duyệt từ chối (có lý do)
    Rejected --> PendingApproval: sửa + gửi lại
    PendingApproval --> Approved: GV duyệt khác người upload, đúng revision
    Approved --> Indexing
    Indexing --> Published: embedding đủ
    Indexing --> Failed: lỗi provider → retry
    Published --> Withdrawn: thu hồi (hiệu lực ngay)
    Published --> Archived: phiên bản mới thay thế
```

Chỉ bản **Published, hiện hành, không bị khóa khẩn cấp, đúng ACL** mới vào retrieval, citation, thư viện.
Mọi chuyển trạng thái quan trọng ghi audit (BR-11).

## 4. Luồng lộ trình học

```mermaid
graph LR
    P[Khai báo đã học tới bài N] --> A[Bài đánh giá ≤ 15 câu<br/>mỗi bài đã học ≥ 1 câu]
    A --> D[Chấm + chẩn đoán theo chủ đề<br/>trang cần đọc lại]
    D --> C{Chọn 1 trong 3 lộ trình}
    C --> S[Các bước ôn / học / kiểm tra]
    S --> K{Đạt ≥ 80% bài kiểm tra?}
    K -->|Có| N[Mở bước học bài mới]
    K -->|Chưa| R[Chèn vòng ôn lại + kiểm tra lại] --> K
```

## 5. Triển khai

```mermaid
graph LR
    subgraph docker compose
        FEC[frontend<br/>Next.js standalone :3000] --> BEC[backend<br/>uvicorn :8000]
        BEC --> PGC[(db<br/>Postgres + pgvector)]
        BEC --- VOL[./data mount<br/>file tài liệu]
    end
```
