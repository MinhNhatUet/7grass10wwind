"""Chuyển output một lần chạy accuracy thành mẫu RAGAS (BL-36).

Case không dùng được (không có câu trả lời, không có context) KHÔNG bị bỏ âm thầm:
chúng được trả về trong danh sách ``excluded`` kèm lý do để báo cáo đếm riêng.
Giới hạn đã biết:
- context_source=citation_quotes chỉ là các đoạn được trích dẫn, không phải toàn bộ context đã retrieve;
- câu nối tiếp: user_input chỉ gồm câu hỏi cuối, không kèm lịch sử hội thoại.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from eval.ragas import RagasConfig
from eval.scoring import LoadedRun

TEXT_KEYS = ("text", "content", "quote")


@dataclass
class RagasSample:
    case_id: str
    user_input: str
    response: str
    retrieved_contexts: list[str]
    reference: str


def _dig(body: Any, dotted: str) -> Any:
    cur = body
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _as_texts(items: Any) -> list[str]:
    texts: list[str] = []
    if not isinstance(items, list):
        return texts
    for it in items:
        if isinstance(it, str) and it.strip():
            texts.append(it)
        elif isinstance(it, dict):
            for key in TEXT_KEYS:
                if isinstance(it.get(key), str) and it[key].strip():
                    texts.append(it[key])
                    break
    return texts


def extract_contexts(body: Any, context_source: str) -> list[str]:
    if context_source == "citation_quotes":
        return _as_texts([{"quote": c.get("quote")} for c in (body or {}).get("citations", []) if isinstance(c, dict)])
    return _as_texts(_dig(body, context_source[len("trace:") :]))


def build_samples(run: LoadedRun, rcfg: RagasConfig) -> tuple[list[RagasSample], list[tuple[str, str]]]:
    samples: list[RagasSample] = []
    excluded: list[tuple[str, str]] = []
    for case in run.cases:
        out = run.outputs.get(case.case_id)
        if out is None or out.status != "ok" or not isinstance(out.body, dict):
            excluded.append((case.case_id, f"không có câu trả lời ({out.status if out else 'chưa chạy'})"))
            continue
        response = str(out.body.get("content") or "")
        if not response.strip():
            excluded.append((case.case_id, "câu trả lời rỗng"))
            continue
        contexts = extract_contexts(out.body, rcfg.context_source)
        if not contexts:
            excluded.append((case.case_id, f"không có context ({rcfg.context_source})"))
            continue
        samples.append(
            RagasSample(
                case_id=case.case_id,
                user_input=case.question,
                response=response,
                retrieved_contexts=contexts,
                reference=case.reference_answer,
            )
        )
    return samples, excluded
