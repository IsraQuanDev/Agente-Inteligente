from __future__ import annotations

from .config import settings
from .document_loader import load_all_sections
from .text_processor import build_chunks
from .vector_store import VectorStore


def build_index(prefer_semantic: bool = True) -> VectorStore:
    sections = load_all_sections(settings.documents_dir)
    chunks = build_chunks(sections)
    store = VectorStore(settings.index_dir, settings.embedding_model)
    store.build(chunks, prefer_semantic=prefer_semantic)
    return store


def load_or_build_index() -> VectorStore:
    store = VectorStore(settings.index_dir, settings.embedding_model)
    if not store.load():
        return build_index()
    return store
