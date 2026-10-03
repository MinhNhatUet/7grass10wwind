"""Framework-agnostic Knowledge Hub core (FR-04, BL-15/16/17)."""

from src.knowledge_hub.agent import KnowledgeHubAgent
from src.knowledge_hub.config import HubConfig
from src.knowledge_hub.errors import (
    InvalidRequest,
    KnowledgeHubError,
    RetrievalError,
    ScopeDenied,
    SourceNotFound,
    SourceUnavailable,
)
from src.knowledge_hub.models import (
    AccessScope,
    Chunk,
    ChunkCandidate,
    DocumentVersion,
    HubSearchItem,
    HubSearchRequest,
    HubSearchResponse,
    HubTrace,
    Locator,
    SearchFilters,
    SourceView,
)
from src.knowledge_hub.retrieval.fusion import ReciprocalRankFusion

__all__ = [
    "AccessScope",
    "Chunk",
    "ChunkCandidate",
    "DocumentVersion",
    "HubConfig",
    "HubSearchItem",
    "HubSearchRequest",
    "HubSearchResponse",
    "HubTrace",
    "InvalidRequest",
    "KnowledgeHubAgent",
    "KnowledgeHubError",
    "Locator",
    "ReciprocalRankFusion",
    "RetrievalError",
    "ScopeDenied",
    "SearchFilters",
    "SourceNotFound",
    "SourceUnavailable",
    "SourceView",
]
