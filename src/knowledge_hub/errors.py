"""Domain errors; HTTP concerns intentionally stay outside the core."""


class KnowledgeHubError(Exception):
    """Base class for all Knowledge Hub domain failures."""


class InvalidRequest(KnowledgeHubError):  # noqa: N818 - public domain name fixed by the core contract
    """The caller supplied an invalid request or inconsistent source IDs."""


class ScopeDenied(KnowledgeHubError):  # noqa: N818 - public domain name fixed by the core contract
    """The resolved access scope does not grant the requested resource."""


class SourceNotFound(KnowledgeHubError):  # noqa: N818 - public domain name fixed by the core contract
    """The requested source or chunk does not exist."""


class SourceUnavailable(KnowledgeHubError):  # noqa: N818 - public domain name fixed by the core contract
    """The source exists but is no longer eligible for serving."""


class RetrievalError(KnowledgeHubError):
    """A retrieval dependency failed and no configured fallback was available."""
