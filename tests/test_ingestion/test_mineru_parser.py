from src.ingestion.chunking.serializers import serialize_element
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


def test_mineru_docvortex_content_preserves_heading_hierarchy_and_ignores_layout_noise():
    payload = {
        "schema": "docvortex.middle",
        "schema_version": "2.0",
        "pages": [
            {
                "page_idx": 0,
                "blocks": [
                    {
                        "type": "paragraph_title",
                        "level": 2,
                        "content": [{"type": "text", "content": "Thiết kế kiến trúc"}],
                    },
                    {
                        "type": "text",
                        "content": [{"type": "text", "content": "Nội dung của section."}],
                    },
                    {
                        "type": "image",
                        "index": 3,
                        "bbox": [0.1, 0.2, 0.3, 0.4],
                        "content": [{"type": "image_body", "index": 3, "content": ""}],
                    },
                    {"type": "footer", "content": [{"type": "text", "content": "Footer lặp"}]},
                    {"type": "page_number", "content": [{"type": "text", "content": "1"}]},
                ],
            }
        ],
    }

    page = _pages_from_mineru_json(payload, "ver1")[0]

    assert [element.type for element in page.elements] == [ElementType.TITLE, ElementType.TEXT, ElementType.FIGURE]
    assert page.elements[0].heading_level == 2
    assert page.elements[0].text == "Thiết kế kiến trúc"
    assert page.elements[2].caption is None
    assert "image_body" not in page.raw_text
    assert "Footer lặp" not in page.raw_text


def test_mineru_docvortex_table_html_is_serialized_as_atomic_text():
    payload = {
        "pages": [
            {
                "page_idx": 0,
                "blocks": [
                    {
                        "type": "table",
                        "content": [
                            {
                                "type": "table_body",
                                "content": "<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>",
                            }
                        ],
                    }
                ],
            }
        ]
    }

    table = _pages_from_mineru_json(payload, "ver1")[0].elements[0]

    assert table.type == ElementType.TABLE
    assert table.rows == [["A", "B"], ["1", "2"]]
    assert serialize_element(table) == "[TABLE]\nA | B\n1 | 2"


def test_mineru_removes_repeated_margin_text_even_when_mislabeled_as_text():
    pages = []
    for index in range(3):
        pages.append(
            {
                "page_idx": index,
                "blocks": [
                    {
                        "type": "text",
                        "bbox": [0.1, 0.2, 0.9, 0.4],
                        "content": [{"type": "text", "content": f"Nội dung trang {index + 1}"}],
                    },
                    {
                        "type": "text",
                        "bbox": [0.2, 0.94, 0.8, 0.98],
                        "content": [{"type": "text", "content": "Khoa CNTT - footer"}],
                    },
                ],
            }
        )

    parsed = _pages_from_mineru_json({"pages": pages}, "ver1")

    assert all("Khoa CNTT" not in page.raw_text for page in parsed)
    assert [page.raw_text for page in parsed] == ["Nội dung trang 1", "Nội dung trang 2", "Nội dung trang 3"]
