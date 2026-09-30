from src.ingestion.models.element import ElementType
from src.ingestion.parsers.mineru_parser import _pages_from_mineru_json


def test_mineru_middle_json_maps_text_formula_and_table():
    payload = {
        "pages": [
            {
                "page_idx": 0,
                "width": 800,
                "height": 1000,
                "blocks": [
                    {"type": "text", "bbox": [10, 20, 300, 80], "text": "Vector field"},
                    {"type": "formula", "bbox": [10, 90, 300, 140], "latex": "F(x,y)=P(x,y)i+Q(x,y)j"},
                    {"type": "table", "bbox": [10, 150, 300, 240], "html": "<table><tr><td>A</td></tr></table>"},
                ],
            }
        ]
    }

    pages = _pages_from_mineru_json(payload, "ver1")

    assert len(pages) == 1
    assert pages[0].locator.number == 1
    assert pages[0].elements[0].type == ElementType.TEXT
    assert pages[0].elements[1].type == ElementType.FORMULA
    assert pages[0].elements[1].latex == "F(x,y)=P(x,y)i+Q(x,y)j"
    assert pages[0].elements[1].recognition_method == "mineru"
    assert pages[0].elements[2].type == ElementType.TABLE


def test_mineru_output_sanitizes_control_chars():
    payload = {"pages": [{"page_idx": 0, "blocks": [{"type": "text", "text": "bad\x08text"}]}]}

    pages = _pages_from_mineru_json(payload, "ver1")

    assert pages[0].elements[0].text == "bad[CONTROL_CHAR]text"
