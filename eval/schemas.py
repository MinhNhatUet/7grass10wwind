"""Schema Pydantic cho config, manifest (BL-02) và dữ liệu kiểm chứng (BL-03).

Căn cứ: PRD 13.3 (TestCase), 13.4 (rubric), 13.6 (safety), 11.3 (status phản hồi).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Config (eval/config.json)
# ---------------------------------------------------------------------------


class HoldoutConfig(BaseModel):
    total: int = Field(gt=0)
    per_question_type: int = Field(gt=0)
    course_allocation: dict[str, int]
    pass_threshold: int = Field(gt=0)

    @model_validator(mode="after")
    def _check_totals(self) -> HoldoutConfig:
        if sum(self.course_allocation.values()) != self.total:
            raise ValueError(
                f"tổng course_allocation = {sum(self.course_allocation.values())} khác total = {self.total}"
            )
        if self.per_question_type * len(QuestionType) != self.total:
            raise ValueError(f"per_question_type × {len(QuestionType)} nhóm phải bằng total = {self.total}")
        return self


class SizeRange(BaseModel):
    min: int = Field(ge=0)
    max: int = Field(ge=0)


class ApiContract(BaseModel):
    """Tên trường mà PRD 11 chưa quy định; đổi trong config khi TV2/TV3 chốt, không sửa code."""

    model_config = ConfigDict(extra="ignore")

    conversation_id_fields: list[str] = Field(min_length=1)
    message_body_field: str
    search_query_param: str


class ApiConfig(BaseModel):
    base_url: str
    prefix: str = "/api/v1"
    timeout_s: float = Field(gt=0)
    concurrency: int = Field(default=1, ge=1)
    contract: ApiContract


class PerfThresholds(BaseModel):
    model_config = ConfigDict(extra="ignore")

    search_p95: float = Field(gt=0)
    answer_p95: float = Field(gt=0)


class PerfConfig(BaseModel):
    warmup: int = Field(ge=0)
    requests: int = Field(gt=0)
    sessions: int = Field(gt=0)
    proposed_thresholds_ms: PerfThresholds


class EvalConfig(BaseModel):
    config_version: str
    manifest_path: str
    manifest_enums: dict[str, list[str]]
    datasets: dict[Literal["dev", "holdout", "safety", "router", "extended"], str]
    fixtures_dir: str
    runs_dir: str
    results_dir: str
    checksums_path: str
    holdout: HoldoutConfig
    dev_size: SizeRange
    safety_min_per_category: dict[str, int]
    second_grader_ratio: float = Field(ge=0.2, le=1.0)
    near_duplicate_ratio: float = Field(gt=0, le=1)
    api: ApiConfig
    perf: PerfConfig


# ---------------------------------------------------------------------------
# Manifest (data/raw/books/manifest.books.json) — giữ nguyên tên trường của file thật
# ---------------------------------------------------------------------------


class Acl(BaseModel):
    model_config = ConfigDict(extra="allow")

    roles: list[str] = Field(default_factory=list)
    download_allowed: bool = False


class ManifestCourse(BaseModel):
    model_config = ConfigDict(extra="allow")

    course_id: str
    name: str
    status: str | None = None


class ManifestSource(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_id: str | None = None
    course_id: str | None = None
    title: str | None = None
    authors: str | None = None
    url: str | None = None
    license: str | None = None
    license_checked: bool | None = None
    file_type: str | None = None
    storage_ref: str | None = None
    page_count: int | None = None
    has_text_layer: bool | None = None
    encrypted: bool | None = None
    sha256: str | None = None
    fetch_error: str | None = None
    version: str | None = None
    supersedes: str | None = None
    usage_permission: str | None = None
    ai_processing_allowed: bool | None = None
    confirmed_by: str | None = None
    confirmed_at: str | None = None
    owner: str | None = None
    is_graded_material: bool = False
    acl: Acl = Field(default_factory=Acl)

    @property
    def eligible_for_serving(self) -> bool:
        """BR-01: chỉ nguồn được phép, được xử lý AI và có người xác nhận mới được phục vụ."""
        return (
            self.usage_permission == "allowed"
            and self.ai_processing_allowed is True
            and bool(self.confirmed_by)
            and bool(self.acl.roles)
        )


class Manifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    manifest_version: str | None = None
    status: str | None = None
    courses: list[ManifestCourse]
    sources: list[ManifestSource]

    def course_names(self) -> dict[str, str]:
        return {c.course_id: c.name for c in self.courses}

    def source_versions(self) -> set[tuple[str, str]]:
        return {(s.source_id, s.version) for s in self.sources if s.source_id and s.version}


# ---------------------------------------------------------------------------
# Dữ liệu kiểm chứng (PRD 13.2, 13.3, 13.6)
# ---------------------------------------------------------------------------


class QuestionType(StrEnum):
    """5 nhóm câu hỏi của PRD 13.2 (mã tiếng Anh: quyết định D-07)."""

    LOOKUP_DEFINITION = "lookup_definition"
    CONCEPT_EXPLANATION = "concept_explanation"
    COMPARE_SYNTHESIZE = "compare_synthesize"
    APPLY_KNOWLEDGE = "apply_knowledge"
    FOLLOW_UP = "follow_up"


QUESTION_TYPE_LABELS: dict[QuestionType, str] = {
    QuestionType.LOOKUP_DEFINITION: "Tra cứu/định nghĩa",
    QuestionType.CONCEPT_EXPLANATION: "Giải thích khái niệm",
    QuestionType.COMPARE_SYNTHESIZE: "So sánh/tổng hợp nhiều đoạn",
    QuestionType.APPLY_KNOWLEDGE: "Vận dụng kiến thức",
    QuestionType.FOLLOW_UP: "Câu nối tiếp",
}

# Business status của Academic Assistant (PRD 11.3)
AssistantStatus = Literal["answered", "partial", "needs_clarification", "insufficient_evidence", "integrity_redirect"]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class SourceVersion(BaseModel):
    source_id: str
    version: str


class Locator(BaseModel):
    source_id: str
    type: Literal["page", "slide"]
    value: int = Field(ge=1)


class TestCase(BaseModel):
    """Một case dev/holdout — đúng 17 trường PRD 13.3."""

    __test__ = False  # không phải test pytest
    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(min_length=1)
    split: Literal["dev", "holdout", "extended"]
    course_id: str
    user_role: str
    permission_fixture: str
    question: str = Field(min_length=1)
    conversation_context: list[Turn] = Field(default_factory=list)
    reference_answer: str = Field(min_length=1)
    required_key_points: list[str] = Field(min_length=1)
    allowed_source_versions: list[SourceVersion] = Field(min_length=1)
    reference_locators: list[Locator] = Field(min_length=1)
    question_type: QuestionType
    difficulty: str
    expected_behavior: AssistantStatus
    label_author: str = Field(min_length=1)
    label_reviewer: str | None = None
    dataset_version: str = Field(min_length=1)


AssistantName = Literal["academic", "learning", "hub"]


class RouterCase(BaseModel):
    """Tập riêng đo router accuracy (PRD 13.5): trợ lý được chọn có thuộc nhãn chấp nhận không."""

    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(min_length=1)
    course_id: str
    permission_fixture: str
    question: str = Field(min_length=1)
    conversation_context: list[Turn] = Field(default_factory=list)
    accepted_assistants: list[AssistantName] = Field(min_length=1)
    label_author: str = Field(min_length=1)
    label_reviewer: str | None = None
    dataset_version: str = Field(min_length=1)


SafetyCategory = Literal[
    "access_leak",
    "integrity",
    "missing_conflict_withdrawn",
    "injection_fake_citation_bad_file",
    "legit_learning",
]

ExpectationType = Literal["status_in", "business_status_in", "no_field_leak", "no_citation_to", "needs_human"]


class Expectation(BaseModel):
    type: ExpectationType
    value: Any = None
    fields: list[str] = Field(default_factory=list)
    note: str | None = None


class SafetyStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    action: str
    as_: str = Field(alias="as", description="Tên fixture tài khoản")
    args: dict[str, Any] = Field(default_factory=dict)
    expect: list[Expectation] = Field(default_factory=list)


class SafetyCase(BaseModel):
    """Một kịch bản safety đã khóa (PRD 13.6); nhiều bước vẫn tính 1 case."""

    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(min_length=1)
    category: SafetyCategory
    description: str = ""
    steps: list[SafetyStep] = Field(min_length=1)
    user_role: str
    permission_fixture: str
    expected_behavior: str = Field(min_length=1)
    severity_if_fail: Literal["P0", "P1", "P2", "P3"]
    related_uat: list[str] = Field(default_factory=list)
    label_author: str = Field(min_length=1)
    label_reviewer: str | None = None
    dataset_version: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Chấm điểm và lần chạy
# ---------------------------------------------------------------------------

FailureCause = Literal["data", "retrieval", "generation", "citation", "routing"]


class RubricGrade(BaseModel):
    """Phiếu chấm 1 case theo 4 tiêu chí PRD 13.4; tiêu chí fail bắt buộc có lý do."""

    case_id: str
    run_id: str
    grader: str = Field(min_length=1)
    knowledge: bool
    knowledge_reason: str = ""
    completeness: bool
    completeness_reason: str = ""
    grounding: bool
    grounding_reason: str = ""
    citation: bool
    citation_reason: str = ""
    disputed: bool = False
    failure_cause: FailureCause | None = None

    @model_validator(mode="after")
    def _reasons_for_failures(self) -> RubricGrade:
        missing = [
            name
            for name in ("knowledge", "completeness", "grounding", "citation")
            if not getattr(self, name) and not getattr(self, f"{name}_reason").strip()
        ]
        if missing:
            raise ValueError(f"tiêu chí fail phải ghi lý do: {', '.join(missing)}")
        return self


OutputStatus = Literal["ok", "http_error", "timeout", "network_error", "blocked"]


class RunOutput(BaseModel):
    """Output thô của 1 case trong 1 lần chạy (data/eval/runs/<run_id>/outputs.jsonl)."""

    case_id: str
    status: OutputStatus
    http_status: int | None = None
    body: Any = None
    latency_ms: float | None = None
    error: str | None = None
    turns_sent: int = 0


class RunConfig(BaseModel):
    """Ảnh chụp cấu hình của 1 lần chạy (PRD 13.7 bước 4)."""

    run_id: str
    kind: Literal["accuracy", "safety", "perf", "router"]
    dataset_path: str | None = None
    dataset_version: str | None = None
    dataset_sha256: str | None = None
    dataset_locked: bool = False
    known_set_regression: bool = False
    base_url: str
    git_commit: str | None = None
    config_version: str
    concurrency: int
    timeout_s: float
    answer_cache: str = "không rõ (API chưa báo)"
    started_at: str
    finished_at: str | None = None
    note: str = ""

    @field_validator("base_url")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.rstrip("/")
