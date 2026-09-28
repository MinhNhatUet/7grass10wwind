import os
from dotenv import load_dotenv
load_dotenv()

from src.agents.state import AgentState
from src.db import get_sessionmaker
from src.models.orm import User, Chunk, Document, DocumentVersion
from sqlalchemy import or_
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

async def analyze_node(state: AgentState) -> dict:
    """Phân tích query từ user."""
    query = state.get("query", "")
    analysis = f"Phân tích: {query}"
    return {"analysis": analysis}


async def respond_node(state: AgentState) -> dict:
    """Tạo response từ analysis sử dụng Gemini API."""
    query = state.get("query", "")
    analysis = state.get("analysis", "")
    error = state.get("error")

    if error:
        return {"response": f"Lỗi: {error}"}

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"response": "Vui lòng cấu hình GOOGLE_API_KEY trong file .env để sử dụng AI."}

    try:
        # Lấy context từ CSDL (Mock RAG bằng SQL để tránh lỗi embedding dimension)
        db = get_sessionmaker()()
        sources = []
        try:
            # Lọc theo từ khóa trong câu hỏi
            keywords = [k for k in query.split() if len(k) > 2]
            
            q = db.query(Chunk, DocumentVersion, Document)\
                .join(DocumentVersion, DocumentVersion.id == Chunk.version_id)\
                .join(Document, Document.id == DocumentVersion.document_id)\
                .filter(Document.course_id == "COURSE-01")
                
            if keywords:
                conditions = [Chunk.text.ilike(f"%{k}%") for k in keywords]
                q = q.filter(or_(*conditions))
                
            hits = q.limit(3).all()
            
            # Fallback nếu không có kết quả từ khóa
            if not hits:
                 hits = db.query(Chunk, DocumentVersion, Document)\
                    .join(DocumentVersion, DocumentVersion.id == Chunk.version_id)\
                    .join(Document, Document.id == DocumentVersion.document_id)\
                    .filter(Document.course_id == "COURSE-01")\
                    .limit(3).all()
            
            if hits:
                context = "\n".join([f"Nguồn [{i+1}]: {doc.file_name if hasattr(doc, 'file_name') else doc.title}\n{chunk.content if hasattr(chunk, 'content') else chunk.text}" for i, (chunk, ver, doc) in enumerate(hits)])
                for chunk, ver, doc in hits:
                    sources.append({
                        "id": chunk.id,
                        "title": doc.file_name if hasattr(doc, 'file_name') else doc.title,
                        "page": chunk.locator_value if hasattr(chunk, 'locator_value') else 1,
                        "content": chunk.content if hasattr(chunk, 'content') else chunk.text,
                        "url": f"http://localhost:8000/api/v1/documents/{doc.id}/versions/{ver.id}/download"
                    })
            else:
                context = "Không tìm thấy tài liệu phù hợp."
        finally:
            db.close()

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.7,
            api_key=api_key
        )
        prompt = f"""Bạn là một trợ lý ảo thông minh. Hãy trả lời câu hỏi sau của người dùng một cách ngắn gọn, súc tích, dựa trên các tài liệu được cung cấp. 

BẮT BUỘC PHẢI TRÍCH DẪN NGUỒN cho các thông tin bạn đưa ra.
Để trích dẫn, hãy sử dụng số thứ tự của nguồn dạng [1], [2] ở ngay sau ý được trích dẫn.

TÀI LIỆU THAM KHẢO:
{context}

CÂU HỎI CỦA NGƯỜI DÙNG:
{query}"""
        
        # Invoke the LLM
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        return {"response": response.content, "sources": sources}
    except Exception as e:
        return {"response": f"Lỗi khi gọi Gemini API: {str(e)}", "sources": []}
