"""RAGAS và chỉ số bổ sung (BL-36; PRD 13.5). Tách hoàn toàn khỏi accuracy do người chấm."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from eval.common import ConfigError, read_json

RAGAS_CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

MetricName = Literal["faithfulness", "answer_relevancy", "context_precision"]


class RagasConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ragas_version: str
    metrics: list[MetricName] = Field(min_length=1)
    context_source: str
    judge_temperature: float = Field(ge=0, le=2)
    thresholds: dict[str, float | str]
    thresholds_confirmed: bool = False

    @field_validator("context_source")
    @classmethod
    def _check_source(cls, v: str) -> str:
        if v != "citation_quotes" and not (v.startswith("trace:") and len(v) > len("trace:")):
            raise ValueError("context_source phải là 'citation_quotes' hoặc 'trace:<đường.dẫn>'")
        return v

    @property
    def metric_thresholds(self) -> dict[str, float]:
        return {k: float(v) for k, v in self.thresholds.items() if not k.startswith("_") and not isinstance(v, str)}


def load_ragas_config(path: str | Path = RAGAS_CONFIG_PATH) -> RagasConfig:
    try:
        return RagasConfig.model_validate(read_json(path))
    except ValueError as e:
        raise ConfigError(f"eval/ragas/config.json không hợp lệ: {e}") from e
