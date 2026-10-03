"""Domain models shared by the core and adapter contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class SearchFilters:
    document_type: str | None = None
    topic: str | None = None
    chapter: str | None = None
    semester: str | None = None
    version: str | None = None


@dataclass(frozen=True)
class HubSearchRequest:
    query: str | None
    course_id: str
    filters: SearchFilters = field(default_factory=SearchFilters)
    page: int = 1
    page_size: int = 10


@dataclass(frozen=True)
class AccessScope:
    user_id: str
    allowed_course_ids: frozenset[str] | set[str]
    allowed_version_ids: frozenset[str] | set[str] | None = None
    downloadable_version_ids: frozenset[str] | set[str] | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "allowed_course_ids", frozenset(self.allowed_course_ids))
        if self.allowed_version_ids is not None:
            object.__setattr__(self, "allowed_version_ids", frozenset(self.allowed_version_ids))
        if self.downloadable_version_ids is not None:
            object.__setattr__(self, "downloadable_version_ids", frozenset(self.downloadable_version_ids))


@dataclass(frozen=True)
class DocumentVersion:
    document_id: str
    version_id: str
    course_id: str
    title: str
    document_type: str | None
    version_label: str | None
    status: str
    withdrawn: bool
    topic: str | None = None
    chapter: str | None = None
    semester: str | None = None
    can_download_default: bool = False
    available: bool = True


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    version_id: str
    text: str
    page: int | None = None
    slide: int | None = None
    section: str | None = None


@dataclass(frozen=True)
class Locator:
    page: int | None = None
    slide: int | None = None
    section: str | None = None


@dataclass(frozen=True)
class RetrievalFilter:
    course_id: str
    allowed_version_ids: frozenset[str] | None
    document_type: str | None = None
    topic: str | None = None
    chapter: str | None = None
    semester: str | None = None
    version: str | None = None
    required_status: str = "Published"
    exclude_withdrawn: bool = True


@dataclass(frozen=True)
class ChunkCandidate:
    chunk_id: str
    version_id: str
    text: str
    page: int | None = None
    slide: int | None = None
    section: str | None = None
    vector_score: float | None = None
    lexical_score: float | None = None
    vector_rank: int | None = None
    lexical_rank: int | None = None
    fusion_score: float | None = None
    rerank_score: float | None = None


@dataclass(frozen=True)
class HubSearchItem:
    document_id: str
    version_id: str
    chunk_id: str | None
    title: str
    course_id: str
    document_type: str | None
    version_label: str | None
    snippet: str | None
    locator: Locator | None
    score: float | None
    best_match_score: float | None
    can_view: bool
    can_download: bool


@dataclass
class HubTrace:
    mode: Literal["browse", "hybrid"]
    requested_course_id: str
    vector_candidate_count: int = 0
    lexical_candidate_count: int = 0
    fused_candidate_count: int = 0
    eligible_candidate_count: int = 0
    reranked_candidate_count: int = 0
    reranker_fallback: bool = False
    returned_count: int = 0
    filtered_reason_counts: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class HubSearchResponse:
    items: list[HubSearchItem]
    total: int
    page: int
    page_size: int
    mode: Literal["browse", "hybrid"]
    trace: HubTrace | None = None


@dataclass(frozen=True)
class SourceView:
    document_id: str
    version_id: str
    title: str
    version_label: str | None
    excerpt: str | None
    locator: Locator | None
    can_download: bool
