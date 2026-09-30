"""Công cụ học chủ động mở rộng FR-03 (D-30; đề xuất của người dùng 26/09/2026, ngoài danh sách PRD 7.2):

- diagnose  : chẩn đoán chủ động — 3 câu tình huống về kiến thức nền, chấm xong chỉ ra phần hổng + trang cần đọc.
- flashcards: thẻ ghi nhớ (active recall) — mỗi thẻ gắn nguồn.
- cloze     : bài điền khuyết — đáp án phải xuất hiện nguyên văn trong đoạn nguồn được gắn, nếu không bỏ thẻ.
- analogy   : giải thích bằng ẩn dụ đời thường — nguyên lý có [n], phần ẩn dụ đánh dấu rõ không phải nguồn.
- triage    : cấp cứu sát giờ thi — đúng 3 phần (định nghĩa, sai lầm phổ biến, 2 ví dụ), mọi mục có nguồn;
              "sai lầm" chỉ lấy từ lưu ý/cảnh báo có trong tài liệu, không có thì ghi rõ.

Chung: chỉ dùng nguồn Published đúng quyền trong môn router đã chốt (BR-01/02/03), mục không có nguồn hợp lệ bị loại
(BR-04), không đưa đáp án bài tính điểm (BR-06; bài điền khuyết/flashcard là tự học, không tính điểm).
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import User
from src.services.assistants import (
    BASE_POLICY,
    AssistantResult,
    call_json,
    format_sources,
    json_dicts,
    strip_citations,
)
from src.services.assistants.academic import answer as academic_answer
from src.services.assistants.academic import evidence
from src.services.policy import INSUFFICIENT_MESSAGE
from src.services.retrieval import Hit, search, still_servable

MAX_CARDS = 10
TRIAGE_LIMITS = {"definitions": 8, "pitfalls": 5, "examples": 2}
# Truy vấn phụ để gom đúng loại nội dung cho chế độ cấp cứu (sách dev là tiếng Anh)
TRIAGE_PROBES = {
    "definitions": "definition is called defined as",
    "pitfalls": "note that be careful common mistake warning not always does not",
    "examples": "example for instance",
}


def _refs(raw: Any, hits: list[Hit], db: Session, user: User) -> list[int]:
    out = []
    for n in raw if isinstance(raw, list) else [raw]:
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= len(hits) and n not in out and still_servable(db, user, hits[n - 1].version.id):
            out.append(n)
    return out


def _used(hits: list[Hit], ns: set[int]) -> list[tuple[int, Hit]]:
    return [(k, hits[k - 1]) for k in sorted(ns)]


def _empty(kind: str) -> AssistantResult:
    return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE, payload={"kind": kind})


# ---------------------------------------------------------------- chẩn đoán chủ động


def diagnose(
    db: Session, user: User, course_id: str, topic: str, retrieval_query: str | None = None
) -> AssistantResult:
    hits = evidence(db, user, course_id, retrieval_query or topic)
    if not hits:
        return _empty("diagnose")
    data = call_json(
        BASE_POLICY,
        "Sinh viên chưa biết bắt đầu từ đâu. Tạo ĐÚNG 3 câu hỏi tình huống ngắn, vui, dễ hiểu để kiểm tra KIẾN THỨC NỀN "
        "(khái niệm gốc mà phần sau phụ thuộc) của CHỦ ĐỀ, chỉ dựa trên NGUỒN. Mỗi câu nhắm một khái niệm gốc khác nhau. "
        'Trả về JSON {"questions":[{"topic":"khái niệm gốc","objective":"kiểm tra điều gì","question":"...","source":n}]}. '
        f"KHÔNG kèm đáp án. Nếu NGUỒN không đủ để tạo nội dung về CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi. \n\nNGUỒN:\n{format_sources(hits)}\n\nCHỦ ĐỀ: {topic}",
        temperature=0.4,
    )
    questions, used = [], set()
    for i, q in enumerate(json_dicts(data, "questions")[:3], start=1):
        refs = _refs(q.get("source"), hits, db, user)
        if not refs or not str(q.get("question") or "").strip():
            continue
        used.update(refs)
        questions.append(
            {
                "id": f"q{i}",
                "topic": str(q.get("topic") or topic)[:200],
                "objective": str(q.get("objective") or "")[:300],
                "question": strip_citations(str(q["question"]))[:800],
                "sources": refs,
            }
        )
    if not questions:
        return _empty("diagnose")
    return AssistantResult(
        status="answered",
        content="Mình hỏi nhanh 3 câu để xem bạn đang vững phần nào. Trả lời theo cách hiểu của bạn, sai cũng không sao.",
        used=_used(hits, used),
        payload={"kind": "diagnose", "topic": topic, "questions": questions, "answers": {}, "assessment": None},
    )


# ---------------------------------------------------------------- flashcard / điền khuyết


def flashcards(
    db: Session,
    user: User,
    course_id: str,
    topic: str,
    mode: str,
    retrieval_query: str | None = None,
    count: int | None = None,
) -> AssistantResult:
    """mode: "flashcards" | "cloze". retrieval_query chỉ dùng để truy xuất; topic là chủ đề hiển thị."""
    max_cards = min(count or MAX_CARDS, 20)
    hits = evidence(db, user, course_id, retrieval_query or topic)
    if not hits:
        return _empty(mode)
    if mode == "cloze":
        instruction = (
            f"Tạo {max_cards} câu ĐIỀN KHUYẾT từ NGUỒN về CHỦ ĐỀ. Mỗi câu thay một thuật ngữ/khái niệm then chốt "
            'bằng "____". "answer" phải là cụm từ CHÉP NGUYÊN VĂN từ nguồn n (giữ nguyên ngôn ngữ gốc). '
            'Trả về JSON {"items":[{"sentence":"câu có ____","answer":"...","hint":"gợi ý ngắn","source":n}]}. Nếu NGUỒN không đủ để tạo nội dung về CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi. '
        )
    else:
        instruction = (
            f"Tạo {max_cards} THẺ GHI NHỚ từ NGUỒN về CHỦ ĐỀ: mặt trước là câu hỏi ngắn buộc người học nhớ lại, "
            "mặt sau là câu trả lời ngắn gọn đúng theo nguồn n (tiếng Việt, giữ thuật ngữ gốc). "
            'Trả về JSON {"items":[{"front":"...","back":"...","source":n}]}. Nếu NGUỒN không đủ để tạo nội dung về CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi. '
        )
    data = call_json(
        BASE_POLICY, f"{instruction}\n\nNGUỒN:\n{format_sources(hits)}\n\nCHỦ ĐỀ: {topic}", temperature=0.3
    )
    items, used = [], set()
    for it in json_dicts(data, "items")[:max_cards]:
        refs = _refs(it.get("source"), hits, db, user)
        if not refs:
            continue
        if mode == "cloze":
            sentence, ans = str(it.get("sentence") or ""), str(it.get("answer") or "").strip()
            # đáp án phải có nguyên văn trong đoạn nguồn → thẻ neo chặt vào học liệu, không bịa
            if "____" not in sentence or not ans or ans.casefold() not in hits[refs[0] - 1].chunk.text.casefold():
                continue
            items.append(
                {
                    "sentence": strip_citations(sentence)[:500],
                    "answer": ans[:120],
                    "hint": strip_citations(str(it.get("hint") or ""))[:200],
                    "sources": refs[:1],
                }
            )
        else:
            front, back = str(it.get("front") or "").strip(), str(it.get("back") or "").strip()
            if not front or not back:
                continue
            items.append(
                {"front": strip_citations(front)[:300], "back": strip_citations(back)[:600], "sources": refs[:1]}
            )
        used.update(refs[:1])
    if not items:
        return _empty(mode)
    label = "câu điền khuyết" if mode == "cloze" else "thẻ ghi nhớ"
    return AssistantResult(
        status="answered",
        content=f"Đây là {len(items)} {label} về “{topic}”. Tự nhớ lại trước khi xem đáp án — mỗi thẻ có nguồn để đối chiếu.",
        used=_used(hits, used),
        payload={"kind": mode, "topic": topic, "items": items},
    )


def mcq(
    db: Session, user: User, course_id: str, topic: str, retrieval_query: str | None = None, count: int | None = None
) -> AssistantResult:
    """Trắc nghiệm A–D để TỰ ÔN (không phải bài tính điểm): mỗi câu 4 lựa chọn, 1 đáp án, giải thích + nguồn n.
    Câu thiếu lựa chọn/đáp án/nguồn hợp lệ bị loại (không bịa)."""
    n = min(count or 10, 20)
    hits = evidence(db, user, course_id, retrieval_query or topic)
    if not hits:
        return _empty("mcq")
    data = call_json(
        BASE_POLICY,
        f"Tạo {n} câu TRẮC NGHIỆM tự ôn về CHỦ ĐỀ, chỉ dựa trên NGUỒN. Mỗi câu 4 lựa chọn, đúng 1 đáp án đúng; các "
        "lựa chọn sai phải hợp lý (lỗi hiểu nhầm thường gặp), không đánh đố. Giải thích ngắn vì sao đáp án đúng, theo nguồn n. "
        'Trả về JSON {"items":[{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"...","source":n}]} Nếu NGUỒN không đủ để tạo nội dung về CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi. '
        f"(correct là chỉ số 0–3).\n\nNGUỒN:\n{format_sources(hits)}\n\nCHỦ ĐỀ: {topic}",
        temperature=0.4,
    )
    items, used = [], set()
    for it in json_dicts(data, "items")[:n]:
        refs = _refs(it.get("source"), hits, db, user)
        opts = [strip_citations(str(o)).strip()[:300] for o in (it.get("options") or [])]
        q = strip_citations(str(it.get("question") or "")).strip()
        try:
            correct = int(it.get("correct"))
        except (TypeError, ValueError):
            continue
        if not refs or not q or len(opts) != 4 or not all(opts) or len(set(opts)) != 4 or not 0 <= correct <= 3:
            continue
        items.append(
            {
                "question": q[:600],
                "options": opts,
                "correct": correct,
                "explanation": strip_citations(str(it.get("explanation") or ""))[:600],
                "sources": refs[:1],
            }
        )
        used.update(refs[:1])
    if not items:
        return _empty("mcq")
    return AssistantResult(
        status="answered",
        content=f"Đây là {len(items)} câu trắc nghiệm về “{topic}”. Chọn đáp án để biết đúng/sai ngay — mỗi câu có giải thích và nguồn.",
        used=_used(hits, used),
        payload={"kind": "mcq", "topic": topic, "items": items},
    )


# ---------------------------------------------------------------- giải thích bằng ẩn dụ


def analogy(
    db: Session, user: User, course_id: str, question: str, history: list, context: str | None, retrieval_query: str
) -> AssistantResult:
    """Bước 1: trả lời có nguồn như Academic. Bước 2: diễn lại ĐÚNG nội dung đó bằng ẩn dụ đời thường — chỉ dựa trên
    câu trả lời bước 1 (không thêm kiến thức), không có [n], đặt dưới tiêu đề đánh dấu là ẩn dụ minh họa."""
    ctx = (context or "một tình huống đời thường quen thuộc với sinh viên").strip()[:120]
    # Bước 1 chỉ hỏi về khái niệm (không kèm bối cảnh ẩn dụ) — nguồn không có "trà sữa" không làm câu trả lời bị partial
    concept = f"Giải thích {retrieval_query}"
    result = academic_answer(db, user, course_id, concept, history, retrieval_query=retrieval_query)
    result.payload.update({"kind": "analogy", "analogy_context": ctx})
    if result.status not in ("answered", "partial") or not result.used:
        return result  # không có nguyên lý có nguồn thì không dựng ẩn dụ
    data = call_json(
        BASE_POLICY,
        f"Dưới đây là NGUYÊN LÝ đã được kiểm chứng. Hãy diễn giải lại đúng nguyên lý đó bằng ẩn dụ về {ctx} cho sinh viên "
        "dễ hiểu (4–7 câu). KHÔNG thêm kiến thức mới ngoài nguyên lý, KHÔNG dùng [n]. Kết thúc bằng 1 câu nêu chỗ ẩn dụ "
        'không khớp hoàn toàn với khái niệm gốc. JSON: {"analogy":"...","limit":"chỗ ẩn dụ không khớp"}'
        f"\n\nNGUYÊN LÝ:\n{strip_citations(result.content)}",
        temperature=0.6,
    )
    story = strip_citations(str(data.get("analogy") or "")).strip()
    limit = strip_citations(str(data.get("limit") or "")).strip()
    if story:
        result.content += f"\n\nVí dụ đời thường — {ctx} (ẩn dụ minh họa, KHÔNG phải nội dung nguồn):\n{story}" + (
            f"\nLưu ý: {limit}" if limit else ""
        )
    return result


# ---------------------------------------------------------------- cấp cứu sát giờ thi


def _triage_hits(db: Session, user: User, course_id: str, query: str) -> list[Hit]:
    """Gom nguồn cho 3 phần bằng truy vấn chủ đề + truy vấn phụ; vẫn qua evidence gate của chủ đề."""
    base = evidence(db, user, course_id, query)
    if not base:
        return []
    min_score = get_settings().retrieval_min_score
    seen = {h.chunk.id for h in base}
    hits = list(base)
    for probe in TRIAGE_PROBES.values():
        for h in search(db, user, course_id, f"{query} {probe}", k=4):
            if h.chunk.id not in seen and h.score >= min_score:
                seen.add(h.chunk.id)
                hits.append(h)
    return hits[:14]


def triage(db: Session, user: User, course_id: str, topic: str, retrieval_query: str | None = None) -> AssistantResult:
    hits = _triage_hits(db, user, course_id, retrieval_query or topic)
    if not hits:
        return _empty("triage")
    data = call_json(
        BASE_POLICY,
        "CHẾ ĐỘ CẤP CỨU: sinh viên thi sát giờ. Chỉ dựa trên NGUỒN, trả về ĐÚNG 3 phần, ngắn gọn, bỏ lý thuyết rườm rà:\n"
        f"- definitions: tối đa {TRIAGE_LIMITS['definitions']} định nghĩa bắt buộc phải thuộc (term + nội dung cốt lõi);\n"
        f"- pitfalls: tối đa {TRIAGE_LIMITS['pitfalls']} sai lầm/nhầm lẫn cần tránh — CHỈ lấy từ lưu ý, cảnh báo, "
        "phản ví dụ, điều kiện hay bị bỏ sót CÓ TRONG NGUỒN; nếu nguồn không nêu thì để mảng rỗng, KHÔNG tự nghĩ ra;\n"
        f"- examples: đúng {TRIAGE_LIMITS['examples']} ví dụ cốt lõi nhất có trong nguồn (tóm tắt đề + ý chính lời giải "
        "của VÍ DỤ minh họa trong sách, không phải bài tập tính điểm).\n"
        'JSON: {"definitions":[{"term":"...","text":"...","source":n}],"pitfalls":[{"text":"...","source":n}],'
        '"examples":[{"title":"...","text":"...","source":n}]}'
        f"\n\nNGUỒN:\n{format_sources(hits)}\n\nPHẠM VI THI: {topic}",
        temperature=0.2,
    )
    sections: dict[str, list[dict]] = {}
    used: set[int] = set()
    for key, limit in TRIAGE_LIMITS.items():
        items = []
        for it in json_dicts(data, key)[: limit * 2]:
            refs = _refs(it.get("source"), hits, db, user)
            text = str(it.get("text") or "").strip()
            if not refs or not text:
                continue  # mục không có nguồn hợp lệ bị loại (BR-04)
            item = {"text": strip_citations(text)[:600], "sources": refs[:1]}
            if key == "definitions":
                item["term"] = str(it.get("term") or "")[:120]
            if key == "examples":
                item["title"] = str(it.get("title") or "")[:160]
            items.append(item)
            used.update(refs[:1])
            if len(items) == limit:
                break
        sections[key] = items
    if not any(sections.values()):
        return _empty("triage")
    notes = []
    if not sections["pitfalls"]:
        notes.append("Tài liệu được phép không nêu rõ sai lầm/lưu ý nào cho phạm vi này — mình không tự bịa thêm.")
    if len(sections["examples"]) < TRIAGE_LIMITS["examples"]:
        notes.append("Không tìm đủ 2 ví dụ trong tài liệu cho phạm vi này.")
    return AssistantResult(
        status="partial" if notes else "answered",
        content=f"Phao cứu sinh cho “{topic}”: định nghĩa phải thuộc, sai lầm cần tránh và ví dụ cốt lõi — bấm [n] để đối chiếu nguồn.",
        used=_used(hits, used),
        payload={"kind": "triage", "topic": topic, "sections": sections, "notes": notes},
    )


def _closest_topic(name: str, by_topic: dict[str, set[int]]) -> set[int]:
    """Khớp chủ đề đã bị LLM viết lại: phần lớn âm tiết của tên ngắn hơn phải có trong tên kia, và chỉ một ứng viên
    tốt nhất. Không khớp chắc chắn → không gắn trang (tránh chỉ sai trang vì trùng từ chung như "của", "các")."""
    words = set(re.findall(r"\w+", name))
    scored = []
    for key, refs in by_topic.items():
        other = set(re.findall(r"\w+", key))
        if words and other:
            scored.append((len(words & other) / min(len(words), len(other)), refs))
    scored.sort(key=lambda s: s[0], reverse=True)
    if not scored or scored[0][0] < 0.6 or (len(scored) > 1 and scored[1][0] == scored[0][0]):
        return set()
    return scored[0][1]


def review_pages(questions: list[dict], assessment: dict, citation_pages: dict[int, int]) -> dict:
    """Gắn trang cần đọc lại cho chủ đề hổng (chẩn đoán): lấy từ nguồn thật của câu hỏi, không đoán."""
    by_topic: dict[str, set[int]] = {}
    for q in questions:
        by_topic.setdefault(q["topic"].casefold(), set()).update(q.get("sources", []))
    for t in assessment.get("topics", []):
        if t.get("level") in ("missing_foundation", "needs_reinforcement"):
            name = str(t.get("topic", "")).casefold()
            refs = by_topic.get(name)
            if refs is None:  # LLM đổi cách viết chủ đề → khớp gần, nhưng chỉ khi rõ ràng
                refs = _closest_topic(name, by_topic)
            t["review_citations"] = sorted(refs)
            t["review_pages"] = sorted({citation_pages[n] for n in refs if n in citation_pages})
    return assessment
