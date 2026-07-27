from src.config import settings
from src.indexing import load_or_build_index
from src.rag_agent import CorporateRAGAgent

QUESTIONS = [
    "¿Qué versión de Java utiliza el equipo backend?",
    "¿Qué debe contener un post-mortem?",
    "¿Cuánto gana un desarrollador?",
]

store = load_or_build_index()
agent = CorporateRAGAgent(store, min_relevance_score=settings.min_relevance_score)

for question in QUESTIONS:
    response = agent.ask(question)
    print("\nPREGUNTA:", question)
    print("RESPUESTA:", response.answer)
    print("FUENTES:", [item.chunk.source for item in response.sources])
