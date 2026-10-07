"""Công cụ học chủ động mở rộng FR-03 (D-30; đề xuất của người dùng 26/09/2026, ngoài danh sách PRD 7.2):

- diagnose  : chẩn đoán chủ động — 3 câu tình huống về kiến thức nền, chấm xong chỉ ra phần hổng + trang cần đọc.
- flashcards: thẻ ghi nhớ (active recall) — mỗi thẻ gắn nguồn.
- cloze     : bài điền khuyết — đáp án phải xuất hiện nguyên văn trong đoạn nguồn được gắn, nếu không bỏ thẻ.

Chung: chỉ dùng nguồn Published đúng quyền trong môn router đã chốt (BR-01/02/03), mục không có nguồn hợp lệ bị loại
(BR-04), không đưa đáp án bài tính điểm (BR-06; bài điền khuyết/flashcard là tự học, không tính điểm).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.orm import Session

from src.models.orm import User
from src.services.assistants import (
    BASE_POLICY,
    MAX_PRACTICE_COUNT,
    AssistantResult,
    balance_answers,
    call_json,
    call_json_items,
    dedupe_key,
    format_sources,
    json_dicts,
    strip_citations,
    verified_quote,
)
from src.services.assistants.academic import evidence, selected_topics
from src.services.policy import INSUFFICIENT_MESSAGE
from src.services.retrieval import Hit, still_servable

log = logging.getLogger(__name__)

MAX_CARDS = 10


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


def _proof(raw: Any, refs: list[int], hits: list[Hit], db: Session, user: User) -> tuple[str, list[int]]:
    """D-74: câu trích chứng minh đáp án, kiểm nguyên văn trong nguồn model gắn; model gắn nhầm số mà câu trích có thật
    ở nguồn khác (đúng quyền) → nhận nguồn thật đó. Không nguồn nào chứa → ("", refs) để loại mục."""
    for n in refs + [k for k in range(1, len(hits) + 1) if k not in refs]:
        if (p := verified_quote(raw, hits[n - 1].chunk.text)) and (
            n in refs or still_servable(db, user, hits[n - 1].version.id)
        ):
            return p, [n]
    return "", refs


def _spare(n: int) -> int:
    """Xin model dư vài mục: mục không kiểm được câu trích bị loại (D-74) mà vẫn đủ số người học yêu cầu."""
    return n + max(2, n // 2)


def _used(hits: list[Hit], ns: set[int]) -> list[tuple[int, Hit]]:
    return [(k, hits[k - 1]) for k in sorted(ns)]


_UNIT_NO = re.compile(r"^(Bài|Chương)\s+(\d+)")


def _about(topic: str) -> str:
    """Tên ngắn cho câu giới thiệu: ôn nhiều bài → "Bài 1, 3, 5" (lấy từ đầu mô tả "Bài N …" frontend gửi; mô tả đầy
    đủ chỉ dùng để truy xuất/prompt). Không nhận ra số bài → "N bài đã chọn"."""
    if picked := selected_topics():
        found = [m.groups() for t in picked if (m := _UNIT_NO.match(t.strip()))]
        return lessons_label(found) if len(found) == len(picked) else f"{len(picked)} bài đã chọn"
    return f"“{topic}”" if len(topic) <= 80 else f"“{topic[:77].rsplit(' ', 1)[0]}…”"


def lessons_label(refs: list[tuple[str, str]]) -> str:
    """[("Bài","3"), ("Bài","1"), ("Chương","5")] → "Bài 1, 3 và Chương 5"."""
    groups: dict[str, list[int]] = {}
    for unit, no in refs:
        groups.setdefault(unit, []).append(int(no))
    return " và ".join(f"{unit} {', '.join(map(str, sorted(set(nos))))}" for unit, nos in groups.items())


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
    max_cards = min(count or MAX_CARDS, MAX_PRACTICE_COUNT)  # trần theo số bài đã kiểm ở API (max_practice_count)
    hits = evidence(db, user, course_id, retrieval_query or topic)
    if not hits:
        return _empty(mode)
    if mode == "cloze":
        instruction = (
            "Tạo {k} câu ĐIỀN KHUYẾT từ NGUỒN về CHỦ ĐỀ. Mỗi câu thay một thuật ngữ/khái niệm then chốt "
            'bằng "____". "answer" phải là cụm từ CHÉP NGUYÊN VĂN từ nguồn n (giữ nguyên ngôn ngữ gốc). '
            'Trả về JSON {"items":[{"sentence":"câu có ____","answer":"...","hint":"gợi ý ngắn","source":n,"proof":"câu CHÉP NGUYÊN VĂN (không dịch, 20–300 ký tự) từ nguồn n chứng minh đáp án"}]}. Nếu NGUỒN không đủ để tạo nội dung về CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi. '
        )
    else:
        instruction = (
            "Tạo {k} THẺ GHI NHỚ từ NGUỒN về CHỦ ĐỀ: mặt trước là câu hỏi ngắn buộc người học nhớ lại, "
            "mặt sau là câu trả lời ngắn gọn đúng theo nguồn n (tiếng Việt, giữ thuật ngữ gốc). "
            'Trả về JSON {"items":[{"front":"...","back":"...","source":n,"proof":"câu CHÉP NGUYÊN VĂN (không dịch, 20–300 ký tự) từ nguồn n chứng minh đáp án"}]}. Nếu NGUỒN không đủ để tạo nội dung về CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi. '
        )
    tail = f"\n\nNGUỒN:\n{format_sources(hits)}\n\nCHỦ ĐỀ: {topic}"
    raw = call_json_items(BASE_POLICY, lambda k: instruction.replace("{k}", str(k)) + tail, max_cards, "items",
                          "sentence" if mode == "cloze" else "front", temperature=0.3, spare=True)  # fmt: skip
    items, used, seen, unproven = [], set(), set(), 0
    for it in raw:
        if len(items) == max_cards:
            break
        refs = _refs(it.get("source"), hits, db, user)
        if not refs:
            continue
        # D-74: thẻ phải kèm câu trích nguyên văn có THẬT trong nguồn chứng minh đáp án — không có thì loại thẻ
        proof, refs = _proof(it.get("proof"), refs, hits, db, user)
        if mode == "cloze":
            sentence, ans = str(it.get("sentence") or ""), str(it.get("answer") or "").strip()
            key = dedupe_key(sentence)
            # đáp án phải có nguyên văn trong đoạn nguồn → thẻ neo chặt vào học liệu, không bịa
            if "____" not in sentence or not ans or ans.casefold() not in hits[refs[0] - 1].chunk.text.casefold():
                continue
            if not proof or ans.casefold() not in proof.casefold():
                unproven += 1
                continue
            if key in seen:
                continue
            items.append(
                {
                    "sentence": strip_citations(sentence)[:500],
                    "answer": ans[:120],
                    "hint": strip_citations(str(it.get("hint") or ""))[:200],
                    "proof": proof,
                    "sources": refs[:1],
                }
            )
        else:
            front, back = str(it.get("front") or "").strip(), str(it.get("back") or "").strip()
            key = dedupe_key(front)
            if not front or not back:
                continue
            if not proof:
                unproven += 1
                continue
            if key in seen:
                continue
            items.append(
                {
                    "front": strip_citations(front)[:300],
                    "back": strip_citations(back)[:600],
                    "proof": proof,
                    "sources": refs[:1],
                }
            )
        seen.add(key)
        used.update(refs[:1])
    log.info(
        "study_items_verified",
        extra={"event": "study_items_verified", "kind": mode, "kept": len(items), "unproven": unproven},
    )
    if not items:
        return _empty(mode)
    label = "câu điền khuyết" if mode == "cloze" else "thẻ ghi nhớ"
    return AssistantResult(
        status="answered",
        content=f"{len(items)} {label} về {_about(topic)} — tự nhớ lại trước khi xem đáp án.",
        used=_used(hits, used),
        payload={"kind": mode, "topic": topic, "label": _about(topic).strip("“”"), "items": items},
    )


# ---------------------------------------------------------------- trắc nghiệm A–D: cơ chế CHUNG cho tự ôn (`mcq`) và bài
# đánh giá theo lộ trình (learning_path.service) — cùng luật soạn, cùng cách kiểm từng câu; mỗi luồng chỉ khác cách chọn
# nguồn/chủ đề và cách làm bài (tự ôn: biết đúng/sai ngay; đánh giá: nộp rồi chấm).

MCQ_RULES = """- 4 lựa chọn, đúng 1 đáp án đúng; 3 phương án nhiễu là các HIỂU NHẦM thường gặp, hợp lý, không đánh đố; không
  nhắc chữ cái A/B/C/D trong lựa chọn hay giải thích (thứ tự lựa chọn sẽ được xáo).
- "correct": chỉ số 0–3 của đáp án đúng.
- "misconceptions": mảng 4 chuỗi theo thứ tự options — với phương án sai, 1 câu nêu hiểu nhầm mà người chọn nó đang mắc;
  phương án đúng để "".
- "explanation": 1–2 câu vì sao đáp án đúng, theo nguồn.
- "proof": câu CHÉP NGUYÊN VĂN (không dịch, 20–300 ký tự) từ nguồn "source" chứng minh đáp án đúng.
- Không viết [n] trong câu hỏi/lựa chọn. Không đủ căn cứ thì bỏ câu đó, không bịa."""


def mcq_item(db: Session, user: User, it: dict[str, Any], candidates: list[tuple[int, Hit]]) -> dict[str, Any] | None:
    """Kiểm một câu model trả: nội dung, đúng 4 lựa chọn khác nhau, đáp án 0–3, câu trích chứng minh có NGUYÊN VĂN trong
    một nguồn ứng viên còn phục vụ (D-74, BR-03) — theo thứ tự ưu tiên của `candidates`. Không đạt → None (loại câu).
    Trả câu đã làm sạch kèm (số nguồn, hit) chứng minh."""
    text = strip_citations(str(it.get("question") or "")).strip()
    opts = [strip_citations(str(o)).strip()[:300] for o in (it.get("options") or [])]
    try:
        correct = int(it.get("correct"))
    except (TypeError, ValueError):
        return None
    if not text or len(opts) != 4 or not all(opts) or len(set(opts)) != 4 or not 0 <= correct <= 3:
        return None
    for n, hit in candidates:
        if (proof := verified_quote(it.get("proof"), hit.chunk.text)) and still_servable(db, user, hit.version.id):
            break
    else:
        return None
    raw_mis = it.get("misconceptions") if isinstance(it.get("misconceptions"), list) else []
    return {
        "text": text[:800], "options": opts, "correct": correct,
        "explanation": strip_citations(str(it.get("explanation") or ""))[:600],
        "misconceptions": {opts[i]: strip_citations(str(raw_mis[i]))[:300] for i in range(4)
                           if i != correct and i < len(raw_mis) and str(raw_mis[i] or "").strip()},
        "proof": proof, "n": n, "hit": hit,
    }  # fmt: skip


def mcq(
    db: Session, user: User, course_id: str, topic: str, retrieval_query: str | None = None, count: int | None = None
) -> AssistantResult:
    """Trắc nghiệm A–D để TỰ ÔN (không phải bài tính điểm), dùng cơ chế chung `MCQ_RULES` + `mcq_item`.
    Câu thiếu lựa chọn/đáp án/nguồn hợp lệ bị loại (không bịa)."""
    n = min(count or 10, MAX_PRACTICE_COUNT)  # trần theo số bài đã kiểm ở API (max_practice_count)
    hits = evidence(db, user, course_id, retrieval_query or topic)
    if not hits:
        return _empty("mcq")
    sources = format_sources(hits)
    raw = call_json_items(
        BASE_POLICY,
        lambda k: f"Tạo {k} câu TRẮC NGHIỆM tự ôn về CHỦ ĐỀ, chỉ dựa trên NGUỒN.\n{MCQ_RULES}\n"
        'JSON: {"items":[{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"...",'
        '"misconceptions":["","...","...","..."],"source":n,"proof":"..."}]} Nếu NGUỒN không đủ để tạo nội dung về '
        "CHỦ ĐỀ, trả về đúng JSON rỗng như mẫu (danh sách rỗng), KHÔNG viết văn xuôi."
        f"\n\nNGUỒN:\n{sources}\n\nCHỦ ĐỀ: {topic}",
        n, "items", "question", temperature=0.4, spare=True,
    )  # fmt: skip
    items, used, seen, unproven = [], set(), set(), 0
    for it in raw:
        if len(items) == n:
            break
        refs = _refs(it.get("source"), hits, db, user)
        if not refs:
            continue
        # nguồn model gắn trước; câu trích có thật ở nguồn khác (đúng quyền) → nhận nguồn thật đó
        order = refs + [k for k in range(1, len(hits) + 1) if k not in refs]
        q = mcq_item(db, user, it, [(k, hits[k - 1]) for k in order])
        if q is None:
            unproven += 1
            continue
        if dedupe_key(q["text"]) in seen:
            continue
        seen.add(dedupe_key(q["text"]))
        items.append({"question": q["text"][:600], "options": q["options"], "correct": q["correct"],
                      "explanation": q["explanation"], "misconceptions": q["misconceptions"], "proof": q["proof"],
                      "sources": [q["n"]]})  # fmt: skip
        used.add(q["n"])
    log.info(
        "study_items_verified",
        extra={"event": "study_items_verified", "kind": "mcq", "kept": len(items), "unproven": unproven},
    )
    balance_answers(items)  # D-69: đáp án đúng không dồn vào A
    if not items:
        return _empty("mcq")
    return AssistantResult(
        status="answered",
        content=f"{len(items)} câu trắc nghiệm về {_about(topic)} — chọn đáp án để biết đúng/sai ngay.",
        used=_used(hits, used),
        payload={"kind": "mcq", "topic": topic, "label": _about(topic).strip("“”"), "items": items},
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
