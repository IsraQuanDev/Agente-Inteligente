from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


@dataclass
class DocumentChunk:
    chunk_id: str
    text: str
    source: str
    category: str
    location: str
    modified_at: str = ""
    owner: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SearchResult:
    chunk: DocumentChunk
    score: float


@dataclass
class AgentResponse:
    answer: str
    sources: list[SearchResult]
    grounded: bool
    mode: str
