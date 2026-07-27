from __future__ import annotations

import hashlib
import re

from .models import DocumentChunk


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    text = clean_text(text)
    if len(text) <= chunk_size:
        return [text] if text else []

    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks, current = [], ""

    for paragraph in paragraphs:
        candidate = f"{current}\n{paragraph}".strip()
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current:
            chunks.append(current)

        if len(paragraph) <= chunk_size:
            current = paragraph
        else:
            start = 0
            while start < len(paragraph):
                end = start + chunk_size
                chunks.append(paragraph[start:end])
                start = max(end - overlap, start + 1)
            current = ""

    if current:
        chunks.append(current)

    # Add overlap from the end of the previous chunk without exceeding useful size.
    with_overlap = []
    for index, chunk in enumerate(chunks):
        if index == 0:
            with_overlap.append(chunk)
        else:
            prefix = chunks[index - 1][-overlap:]
            with_overlap.append(f"{prefix}\n{chunk}".strip())
    return with_overlap


def build_chunks(sections: list[dict]) -> list[DocumentChunk]:
    chunks = []
    for section in sections:
        for index, text in enumerate(split_text(section["text"]), start=1):
            raw_id = f'{section["source"]}|{section["location"]}|{index}|{text[:100]}'
            chunk_id = hashlib.sha256(raw_id.encode("utf-8")).hexdigest()[:16]
            chunks.append(DocumentChunk(
                chunk_id=chunk_id,
                text=text,
                source=section["source"],
                category=section["category"],
                location=section["location"],
                modified_at=section.get("modified_at", ""),
                owner=section.get("owner", ""),
            ))
    return chunks
