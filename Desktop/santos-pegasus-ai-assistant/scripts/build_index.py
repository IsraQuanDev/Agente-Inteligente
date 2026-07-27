import sys
from pathlib import Path

# Agrega la raíz del proyecto al PYTHONPATH
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.indexing import build_index

if __name__ == "__main__":
    store = build_index(prefer_semantic=True)
    print(f"Índice generado: {len(store.chunks)} fragmentos usando {store.backend}.")