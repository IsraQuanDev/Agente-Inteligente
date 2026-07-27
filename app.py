from __future__ import annotations

import streamlit as st

from src.config import settings
from src.indexing import build_index, load_or_build_index
from src.rag_agent import CorporateRAGAgent

st.set_page_config(
    page_title=settings.app_title,
    page_icon="🧠",
    layout="wide",
)

st.title("🧠 Santos Pegasus Corporate AI")
st.caption(
    "Agente RAG para consultar documentos internos. "
    "Las respuestas incluyen evidencia y no deben sustituir la revisión del documento oficial."
)

@st.cache_resource(show_spinner="Cargando índice documental...")
def get_store():
    return load_or_build_index()

store = get_store()
agent = CorporateRAGAgent(
    vector_store=store,
    api_key=settings.google_api_key,
    model_name=settings.gemini_model,
    min_relevance_score=settings.min_relevance_score,
)

with st.sidebar:
    st.header("Configuración")
    category_options = ["Todas"] + store.categories()
    category = st.selectbox("Categoría documental", category_options)
    top_k = st.slider("Fragmentos recuperados", 2, 8, settings.top_k)
    st.info(f"Índice: **{store.backend}** · Fragmentos: **{len(store.chunks)}**")

    if st.button("🔄 Reconstruir índice", use_container_width=True):
        with st.spinner("Procesando documentos..."):
            build_index(prefer_semantic=True)
            st.cache_resource.clear()
        st.success("Índice reconstruido.")
        st.rerun()

    if st.button("🗑️ Limpiar conversación", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

    st.divider()
    st.markdown(
        "**Modo de generación:** "
        + ("Gemini + RAG" if settings.google_api_key else "Extractivo local (sin API)")
    )

if "messages" not in st.session_state:
    st.session_state.messages = []

examples = [
    "¿Qué herramientas debe instalar un nuevo desarrollador?",
    "¿Qué versión de Java utiliza el equipo backend?",
    "¿Qué debe contener un post-mortem?",
    "¿Qué microservicio administra las órdenes?",
]
st.write("**Preguntas de ejemplo:**")
cols = st.columns(2)
for i, example in enumerate(examples):
    if cols[i % 2].button(example, key=f"example_{i}", use_container_width=True):
        st.session_state.pending_question = example

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])
        if message.get("sources"):
            with st.expander("Fuentes consultadas"):
                for source in message["sources"]:
                    st.markdown(source)

question = st.chat_input("Escribe una pregunta sobre los documentos...")
if "pending_question" in st.session_state:
    question = st.session_state.pop("pending_question")

if question:
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("Buscando evidencia documental..."):
            response = agent.ask(
                question,
                top_k=top_k,
                category=None if category == "Todas" else category,
            )

        st.markdown(response.answer)

        source_lines = []
        if response.sources:
            with st.expander("Fuentes consultadas", expanded=True):
                for item in response.sources:
                    line = (
                        f"- **{item.chunk.source}** — {item.chunk.location} "
                        f"· categoría: {item.chunk.category} "
                        f"· relevancia: {item.score:.2f}"
                    )
                    st.markdown(line)
                    source_lines.append(line)

        if not response.grounded:
            st.warning("No hubo evidencia documental con relevancia suficiente.")
        else:
            st.caption(f"Respuesta generada en modo: {response.mode}")

    st.session_state.messages.append({
        "role": "assistant",
        "content": response.answer,
        "sources": source_lines,
    })
