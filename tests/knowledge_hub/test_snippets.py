from src.knowledge_hub.models import Chunk
from src.knowledge_hub.snippets import build_locator, build_snippet


def test_snippet_normalizes_whitespace_and_truncates_deterministically():
    assert build_snippet("  cây\n AVL\t cân bằng  ", 50) == "cây AVL cân bằng"
    assert build_snippet("abcdefgh", 5) == "abcd…"


def test_locator_uses_real_fields_and_never_invents_page():
    assert build_locator(Chunk("c1", "v1", "text")) is None
    locator = build_locator(Chunk("c2", "v1", "text", page=7, section="Mục 2"))
    assert locator.page == 7
    assert locator.slide is None
    assert locator.section == "Mục 2"
