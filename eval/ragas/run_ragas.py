"""Chấm RAGAS trên output của một lần chạy accuracy (BL-36; PRD 13.5).

Chạy:
    python -m eval.ragas.run_ragas --run-id <accuracy_run>

- Judge LLM qua src.services.llm.get_llm (R-12), embedding qua get_embeddings (answer_relevancy).
- Ghi data/eval/runs/<run_id>/ragas_<ts>.jsonl: mỗi dòng {case_id, metric, score, error};
  lượt lỗi/case bị loại có score=null và lý do — không bỏ âm thầm, không tính vào trung bình.
- Ghi ragas_<ts>.meta.json: version thư viện, model judge/embedding, context_source, cờ ngưỡng đã xác nhận.
- Thiếu cấu hình LLM/embedding hoặc chưa cài ragas → exit 3 (blocked), không tạo điểm.
"""

from __future__ import annotations

import argparse
import math
import sys
import warnings
from datetime import datetime
from typing import Any

from eval.common import (
    EXIT_BLOCKED,
    EXIT_CONFIG_ERROR,
    EXIT_OK,
    ConfigError,
    load_config,
    now_iso,
    rel,
    setup_console,
    write_json,
    write_jsonl,
)
from eval.ragas import RagasConfig, load_ragas_config
from eval.ragas.adapter import RagasSample, build_samples
from eval.scoring import load_run


class BlockedError(Exception):
    """Thiếu thư viện hoặc cấu hình để chạy judge."""


def build_judges(rcfg: RagasConfig) -> tuple[Any, Any, dict[str, str]]:
    try:
        import ragas
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper

        from src.config import get_settings
        from src.services.llm import get_embeddings, get_llm
    except ImportError as e:
        raise BlockedError(f"chưa cài đủ thư viện ({e}); chạy: pip install -r requirements.txt") from e

    if ragas.__version__ != rcfg.ragas_version:
        raise BlockedError(f"ragas đang cài {ragas.__version__}, config yêu cầu {rcfg.ragas_version}")
    settings = get_settings()
    if not settings.llm_api_key:
        raise BlockedError("chưa có AI_API_KEY trong .env")
    info = {
        "judge_model": settings.llm_model,
        "embedding_model": f"{settings.embedding_provider}/{settings.embedding_model or '—'}"
        + (f" ({settings.embedding_dimension}d)" if settings.embedding_dimension else ""),
    }
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        llm = LangchainLLMWrapper(get_llm(temperature=rcfg.judge_temperature))
        embeddings = None
        if "answer_relevancy" in rcfg.metrics:
            try:
                embeddings = LangchainEmbeddingsWrapper(get_embeddings())
            except RuntimeError as e:
                raise BlockedError(f"answer_relevancy cần embedding: {e}") from e
    return llm, embeddings, info


def build_metrics(rcfg: RagasConfig) -> list[Any]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        from ragas.metrics import ContextPrecision, Faithfulness, ResponseRelevancy

    factory = {
        "faithfulness": Faithfulness,
        "answer_relevancy": ResponseRelevancy,
        "context_precision": ContextPrecision,
    }
    return [factory[name]() for name in rcfg.metrics]


def score_samples(samples: list[RagasSample], rcfg: RagasConfig, llm: Any, embeddings: Any) -> list[dict[str, Any]]:
    from ragas import EvaluationDataset, SingleTurnSample, evaluate

    dataset = EvaluationDataset(
        samples=[
            SingleTurnSample(
                user_input=s.user_input,
                response=s.response,
                retrieved_contexts=s.retrieved_contexts,
                reference=s.reference,
            )
            for s in samples
        ]
    )
    result = evaluate(
        dataset=dataset,
        metrics=build_metrics(rcfg),
        llm=llm,
        embeddings=embeddings,
        raise_exceptions=False,
        show_progress=True,
    )
    rows: list[dict[str, Any]] = []
    for sample, scores in zip(samples, result.scores, strict=True):
        for metric in rcfg.metrics:
            value = scores.get(metric)
            ok = isinstance(value, int | float) and not math.isnan(value)
            rows.append(
                {
                    "case_id": sample.case_id,
                    "metric": metric,
                    "score": float(value) if ok else None,
                    "error": None if ok else "judge lỗi hoặc không trả điểm (NaN)",
                }
            )
    return rows


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Chấm RAGAS trên một lần chạy accuracy (BL-36).")
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args(argv)
    try:
        config = load_config()
        rcfg = load_ragas_config()
        run = load_run(config, args.run_id)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    if run.config.kind != "accuracy" or not run.cases:
        print("Cần một lần chạy accuracy có dataset.", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    samples, excluded = build_samples(run, rcfg)
    print(f"{len(run.cases)} case · dùng được {len(samples)} · loại {len(excluded)} (có lý do, được báo cáo)")
    if not rcfg.thresholds_confirmed:
        print("⚠️ Ngưỡng RAGAS chưa được xác nhận — kết quả chỉ để chẩn đoán, không dùng nghiệm thu (PRD 13.5).")
    if not samples:
        print("Không có mẫu nào để chấm.")
        return EXIT_CONFIG_ERROR

    try:
        llm, embeddings, info = build_judges(rcfg)
    except BlockedError as e:
        print(f"BLOCKED: {e}. Không tạo điểm.")
        return EXIT_BLOCKED

    started = now_iso()
    rows = score_samples(samples, rcfg, llm, embeddings)
    rows += [
        {"case_id": cid, "metric": m, "score": None, "error": f"loại: {why}"}
        for cid, why in excluded
        for m in rcfg.metrics
    ]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = write_jsonl(run.path / f"ragas_{stamp}.jsonl", rows)
    write_json(
        run.path / f"ragas_{stamp}.meta.json",
        {
            "run_id": args.run_id,
            "ragas_version": rcfg.ragas_version,
            "metrics": rcfg.metrics,
            "context_source": rcfg.context_source,
            "judge_temperature": rcfg.judge_temperature,
            "thresholds": rcfg.metric_thresholds,
            "thresholds_confirmed": rcfg.thresholds_confirmed,
            "n_samples": len(samples),
            "n_excluded": len(excluded),
            "started_at": started,
            "finished_at": now_iso(),
            **info,
        },
    )
    print(f"Đã ghi {rel(out)}. Báo cáo: python -m eval.ragas.report --run-id {args.run_id}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
