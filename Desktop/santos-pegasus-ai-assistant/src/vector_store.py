from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .models import DocumentChunk, SearchResult


class VectorStore:
    """Semantic index with SentenceTransformers and an automatic TF-IDF fallback."""

    def __init__(self, index_dir: Path, embedding_model: str):
        self.index_dir = Path(index_dir)
        self.embedding_model_name = embedding_model
        self.chunks: list[DocumentChunk] = []
        self.embeddings: np.ndarray | None = None
        self.vectorizer: TfidfVectorizer | None = None
        self.backend = "unknown"
        self._model = None

    @property
    def metadata_path(self) -> Path:
        return self.index_dir / "chunks.json"

    @property
    def embeddings_path(self) -> Path:
        return self.index_dir / "embeddings.npy"

    @property
    def tfidf_path(self) -> Path:
        return self.index_dir / "tfidf.pkl"

    @property
    def manifest_path(self) -> Path:
        return self.index_dir / "manifest.json"

    def _load_sentence_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.embedding_model_name)
        return self._model

    def build(self, chunks: list[DocumentChunk], prefer_semantic: bool = True) -> None:
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.chunks = chunks
        texts = [chunk.text for chunk in chunks]

        if not texts:
            raise ValueError("No hay contenido para indexar.")

        if prefer_semantic:
            try:
                model = self._load_sentence_model()
                self.embeddings = np.asarray(
                    model.encode(texts, normalize_embeddings=True, show_progress_bar=False),
                    dtype=np.float32,
                )
                np.save(self.embeddings_path, self.embeddings)
                self.backend = "sentence-transformers"
            except Exception as exc:
                print(f"[WARN] Embeddings semánticos no disponibles: {exc}")
                self._build_tfidf(texts)
        else:
            self._build_tfidf(texts)

        self.metadata_path.write_text(
            json.dumps([chunk.to_dict() for chunk in chunks], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.manifest_path.write_text(
            json.dumps({
                "backend": self.backend,
                "embedding_model": self.embedding_model_name,
                "chunks": len(chunks),
            }, indent=2),
            encoding="utf-8",
        )

    def _build_tfidf(self, texts: list[str]) -> None:
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=12000,
            strip_accents="unicode",
        )
        self.embeddings = self.vectorizer.fit_transform(texts)
        with self.tfidf_path.open("wb") as fh:
            pickle.dump((self.vectorizer, self.embeddings), fh)
        self.backend = "tfidf-fallback"

    def load(self) -> bool:
        if not self.metadata_path.exists() or not self.manifest_path.exists():
            return False

        data = json.loads(self.metadata_path.read_text(encoding="utf-8"))
        self.chunks = [DocumentChunk(**item) for item in data]
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.backend = manifest["backend"]

        if self.backend == "sentence-transformers" and self.embeddings_path.exists():
            self.embeddings = np.load(self.embeddings_path)
            return True

        if self.tfidf_path.exists():
            with self.tfidf_path.open("rb") as fh:
                self.vectorizer, self.embeddings = pickle.load(fh)
            return True

        return False

    def search(
        self,
        query: str,
        top_k: int = 5,
        category: str | None = None,
    ) -> list[SearchResult]:
        if self.embeddings is None or not self.chunks:
            raise RuntimeError("El índice no está cargado.")

        if self.backend == "sentence-transformers":
            model = self._load_sentence_model()
            query_vector = np.asarray(
                model.encode([query], normalize_embeddings=True, show_progress_bar=False),
                dtype=np.float32,
            )
            scores = np.dot(self.embeddings, query_vector[0])
        else:
            if self.vectorizer is None:
                raise RuntimeError("Vectorizador TF-IDF no cargado.")
            query_vector = self.vectorizer.transform([query])
            scores = cosine_similarity(query_vector, self.embeddings)[0]

        indices = range(len(self.chunks))
        if category and category != "Todas":
            indices = [i for i in indices if self.chunks[i].category == category]

        ranked = sorted(indices, key=lambda i: float(scores[i]), reverse=True)[:top_k]
        return [
            SearchResult(chunk=self.chunks[i], score=float(scores[i]))
            for i in ranked
        ]

    def categories(self) -> list[str]:
        return sorted({chunk.category for chunk in self.chunks})
