from pathlib import Path

from src.models import DocumentChunk
from src.vector_store import VectorStore


def test_tfidf_search_returns_relevant_chunk(tmp_path: Path):
    chunks = [
        DocumentChunk("1", "Java 21 y Spring Boot son el estándar backend.", "backend.pdf", "Backend", "Página 1"),
        DocumentChunk("2", "El programa de vacaciones pertenece a recursos humanos.", "rh.pdf", "RH", "Página 1"),
    ]
    store = VectorStore(tmp_path, "unused")
    store.build(chunks, prefer_semantic=False)
    results = store.search("¿Qué versión de Java usa backend?", top_k=1)
    assert results[0].chunk.source == "backend.pdf"
