from __future__ import annotations

import re

from .models import AgentResponse, SearchResult
from .vector_store import VectorStore


SYSTEM_INSTRUCTION = """
Eres el asistente corporativo de Santos Pegasus Soluciones.
Responde únicamente con la información del contexto documental proporcionado.
No inventes políticas, personas, cifras, fechas ni procedimientos.
Si la evidencia no es suficiente, dilo claramente.
Escribe en español, con una respuesta directa y fácil de verificar.
No incluyas referencias inventadas: las fuentes se agregan por separado.
""".strip()


class CorporateRAGAgent:
    def __init__(
        self,
        vector_store: VectorStore,
        api_key: str = "",
        model_name: str = "gemini-2.0-flash",
        min_relevance_score: float = 0.28,
    ):
        self.store = vector_store
        self.api_key = api_key
        self.model_name = model_name
        self.min_relevance_score = min_relevance_score

    def ask(self, question: str, top_k: int = 5, category: str | None = None) -> AgentResponse:
        results = self.store.search(question, top_k=top_k, category=category)
        useful = [r for r in results if r.score >= self.min_relevance_score]

        if not useful:
            return AgentResponse(
                answer=(
                    "No encontré esa información en los documentos corporativos disponibles. "
                    "Consulta al área responsable o incorpora un documento oficial que cubra el tema."
                ),
                sources=[],
                grounded=False,
                mode="fallback",
            )

        if self.api_key:
            try:
                answer = self._generate_with_gemini(question, useful)
                return AgentResponse(answer=answer, sources=useful, grounded=True, mode="gemini")
            except Exception as exc:
                print(f"[WARN] Gemini no disponible; se usará respuesta extractiva: {exc}")

        answer = self._extractive_answer(question, useful)
        return AgentResponse(answer=answer, sources=useful, grounded=True, mode="extractivo")

    def _generate_with_gemini(self, question: str, results: list[SearchResult]) -> str:
        from google import genai

        client = genai.Client(api_key=self.api_key)
        context = "\n\n".join(
            f"[{i}] Documento: {r.chunk.source}; Ubicación: {r.chunk.location}\n{r.chunk.text}"
            for i, r in enumerate(results, start=1)
        )
        prompt = f"""
{SYSTEM_INSTRUCTION}

PREGUNTA:
{question}

CONTEXTO DOCUMENTAL:
{context}

Genera una respuesta breve pero completa. Cuando haya pasos, ordénalos.
""".strip()
        response = client.models.generate_content(model=self.model_name, contents=prompt)
        return (response.text or "").strip()

    @staticmethod
    def _extractive_answer(question: str, results: list[SearchResult]) -> str:
        # Offline mode: select the most informative sentences from retrieved evidence.
        terms = {
            token for token in re.findall(r"\w+", question.lower(), flags=re.UNICODE)
            if len(token) > 3
        }
        candidates = []
        for result in results[:3]:
            sentences = re.split(r"(?<=[.!?])\s+|\n+", result.chunk.text)
            for sentence in sentences:
                sentence = sentence.strip(" -•")
                if len(sentence) < 35:
                    continue
                words = set(re.findall(r"\w+", sentence.lower(), flags=re.UNICODE))
                overlap = len(terms & words)
                candidates.append((overlap, len(sentence), sentence))

        candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
        selected = []
        seen = set()
        for _, _, sentence in candidates:
            normalized = sentence.lower()
            if normalized not in seen:
                selected.append(sentence)
                seen.add(normalized)
            if len(selected) == 4:
                break

        if not selected:
            selected = [results[0].chunk.text[:700].strip()]

        return "Según la documentación disponible:\n\n" + "\n".join(
            f"- {sentence}" for sentence in selected
        )
