from src.ingestion.quality.text_quality import (
    contains_unsafe_control_chars,
    evaluate_native_text,
    replace_unsafe_control_chars,
)


def test_plain_native_text_is_usable():
    quality = evaluate_native_text("Vector field")

    assert quality.usable
    assert quality.corruption_ratio == 0


def test_newline_and_tab_are_allowed():
    quality = evaluate_native_text("line 1\n\tline 2")

    assert quality.usable
    assert not contains_unsafe_control_chars("line 1\n\tline 2")


def test_c0_control_chars_are_corrupted():
    quality = evaluate_native_text("\x08(x,y)=\x10+\x0e")

    assert not quality.usable
    assert "c0_control_character" in quality.reasons
    assert contains_unsafe_control_chars("\x08(x,y)=\x10+\x0e")


def test_single_control_char_in_long_span_is_not_usable():
    quality = evaluate_native_text("This span is mostly readable but contains one bad glyph \x08")

    assert not quality.usable
    assert quality.corruption_ratio < 0.05


def test_replace_unsafe_control_chars_uses_visible_marker():
    sanitized = replace_unsafe_control_chars("A\x08B\x10C")

    assert sanitized == "A[CONTROL_CHAR]B[CONTROL_CHAR]C"
    assert not contains_unsafe_control_chars(sanitized)


def test_c1_control_chars_are_corrupted():
    quality = evaluate_native_text("abc\x85def")

    assert not quality.usable
    assert "c1_control_character" in quality.reasons


def test_replacement_character_is_corrupted():
    quality = evaluate_native_text("F(x)=�")

    assert not quality.usable
    assert "replacement_character" in quality.reasons
