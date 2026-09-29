"""Chấm điểm và báo cáo (BL-27, BL-28). Máy chỉ gắn cờ và tính số liệu; người chấm là chuẩn (PRD 13.4)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from eval.common import ConfigError, iter_jsonl, read_json, resolve, run_dir
from eval.schemas import EvalConfig, RunConfig, RunOutput, TestCase


@dataclass
class LoadedRun:
    run_id: str
    path: Path
    config: RunConfig
    outputs: dict[str, RunOutput]
    cases: list[TestCase]

    @property
    def case_map(self) -> dict[str, TestCase]:
        return {c.case_id: c for c in self.cases}


def load_run(config: EvalConfig, run_id: str) -> LoadedRun:
    path = run_dir(config, run_id)
    if not (path / "run_config.json").is_file():
        raise ConfigError(f"Không tìm thấy lần chạy {run_id} ở {path}")
    run_cfg = RunConfig.model_validate(read_json(path / "run_config.json"))
    outputs: dict[str, RunOutput] = {}
    if (path / "outputs.jsonl").is_file():
        outputs = {o["case_id"]: RunOutput.model_validate(o) for _, o in iter_jsonl(path / "outputs.jsonl")}
    cases: list[TestCase] = []
    if run_cfg.kind == "accuracy" and run_cfg.dataset_path and resolve(run_cfg.dataset_path).is_file():
        cases = [TestCase.model_validate(o) for _, o in iter_jsonl(run_cfg.dataset_path)]
    return LoadedRun(run_id, path, run_cfg, outputs, cases)
