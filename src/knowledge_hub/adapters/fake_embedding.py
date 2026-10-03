"""Stable hashing embedder for orchestration tests, not relevance benchmarking."""

from __future__ import annotations

import hashlib
import math
import re


class FakeEmbeddingProvider:
    def __init__(self, dimensions: int = 1024) -> None:
        if dimensions <= 0:
            raise ValueError("dimensions must be positive")
        self.dimensions = dimensions
        self.call_count = 0

    def embed_query(self, text: str) -> list[float]:
        self.call_count += 1
        vector = [0.0] * self.dimensions
        tokens = re.findall(r"\w+", text.casefold(), flags=re.UNICODE)
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:4], "big") % self.dimensions
            vector[bucket] += 1.0
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector

    def embed_document(self, text: str) -> list[float]:
        """Build fixture vectors without affecting the query call counter."""
        before = self.call_count
        vector = self.embed_query(text)
        self.call_count = before
        return vector
