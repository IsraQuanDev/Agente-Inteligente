from src.text_processor import clean_text, split_text


def test_clean_text_removes_extra_spaces():
    assert clean_text("hola   mundo\n\n\nfin") == "hola mundo\n\nfin"


def test_split_text_creates_multiple_chunks():
    text = "\n".join(["contenido importante " * 20 for _ in range(10)])
    chunks = split_text(text, chunk_size=300, overlap=30)
    assert len(chunks) > 1
    assert all(chunk.strip() for chunk in chunks)
