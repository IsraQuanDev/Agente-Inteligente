from pathlib import Path

from src.document_loader import discover_documents


def test_discover_documents_finds_supported_files(tmp_path: Path):
    (tmp_path / "policy.md").write_text("# Política", encoding="utf-8")
    (tmp_path / "ignore.bin").write_bytes(b"123")
    results = discover_documents(tmp_path)
    assert [path.name for path in results] == ["policy.md"]
