"""Làm sạch text trích xuất trước khi chia chunk (FR-07.2; PRD 9.3; D-29).

Nguyên tắc:
- Làm sạch theo từng trang/slide → locator (số trang PDF/slide) của mỗi chunk không đổi.
- Chỉ sửa lỗi nhận biết chắc chắn từ chính tài liệu; không đoán/điền chữ bị mất (vd "briey" do mất ligature
  được giữ nguyên) — FR-07.4 "không điền nội dung suy đoán".
- Header/footer lặp được nhận diện theo tần suất trong CHÍNH tài liệu, không theo danh sách cứng.

Các bước: bỏ ký tự điều khiển → NFKC (tách ligature ﬁ/ﬂ…) → sửa dấu mở ngoặc kép kiểu TeX (\\How → “How) →
bỏ header/footer lặp và dòng chỉ có số trang → nối từ bị ngắt bằng gạch nối cuối dòng → nối chữ hoa bị tách
("F undamentals") → gộp dòng bị ngắt cứng thành đoạn → đánh dấu trang mục lục (bỏ khỏi index).
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

HEADER_MIN_PAGES = 3  # một dòng đầu/cuối trang lặp ở ≥3 trang mới coi là header/footer
TOC_DOT_LEADER = re.compile(r"(?:\.\s?){5,}\s*\d+\s*$")
PAGE_NUMBER_LINE = re.compile(r"^\s*(?:page\s+)?\d{1,4}\s*$", re.I)
WORD = re.compile(r"[A-Za-zÀ-ỹ]+")
GLYPH_HEX_RUN = re.compile(r"(?:/x[0-9A-Fa-f]{2}){2,}")
# Tiêu đề mục: "5.3 Hamilton Cycles and Paths", "Chapter 5", "Exercises 5.2."
SECTION_HEADING = re.compile(r"^(?:\d+(?:\.\d+)+\s+\S|Chapter\s+\d+|Exercises\s+\d)")
# Dòng mở đầu một khối mới
BLOCK_START = re.compile(
    r"^(?:\d{1,3}\.\s|\(?[a-z]\)\s|[-•*]\s|(?:DEFINITION|THEOREM|LEMMA|COROLLARY|COROLLAR Y|EXAMPLE|PROOF|Proof\.|"
    r"Exercises|Solution|Note:|Remark)\b)"
)
# Dòng chỉ gồm ký hiệu/dấu chấm (tàn dư hình vẽ, lưới bàn cờ…) — không có chữ hay số
FIGURE_RESIDUE = re.compile(r"^[^\w]{5,}$")
# Dòng chỉ mục cuối sách: "orbit, 139" / "Ore property, 102, 105"
INDEX_LINE = re.compile(r"^[^\d]{2,80},\s*\d+(?:\s*[,–-]\s*\d+)*\s*$")
SPLIT_CAPITAL = re.compile(r"\b([A-Z]) ([a-z]{3,})\b")


@dataclass
class CleaningStats:
    control_chars: int = 0
    ligatures: int = 0
    tex_quotes: int = 0
    header_footer_lines: int = 0
    page_number_lines: int = 0
    hyphen_joins: int = 0
    split_capitals: int = 0
    glyph_hex_runs: int = 0
    tex_ellipses: int = 0
    figure_residue_lines: int = 0
    toc_pages: list[int] = field(default_factory=list)
    index_pages: list[int] = field(default_factory=list)

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def _signature(line: str) -> str:
    """Chuẩn hóa để so dòng header giữa các trang: bỏ số, khoảng trắng, chữ thường."""
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", line)).strip().lower()


# Chỉ số dưới/trên dựng lại từ cỡ chữ + baseline của pdfium (n₁, ∑ⁿᵢ₌₁ mᵢ — D-42); ký tự không có dạng Unicode giữ nguyên
SUB = dict(zip("0123456789+-−=()aehijklmnoprstuvxβγρφχ", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ", strict=True))
SUP = dict(
    zip(
        "0123456789+-−=()abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUW",
        "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁᵂ",
        strict=True,
    )
)
SCRIPT_CHARS = re.escape("".join(sorted(set(SUB.values()) | set(SUP.values()))))
SCRIPT_KEEP = re.compile(f"([{SCRIPT_CHARS}]+)|[^{SCRIPT_CHARS}]+")


def _basic(text: str, stats: CleaningStats) -> str:
    before = len(text)
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    stats.control_chars += before - len(text)
    stats.ligatures += len(re.findall("[ﬀ-ﬆ]", text))
    # NFKC nhưng giữ chỉ số dưới/trên dựng lại từ PDF (n₁, xⁿ — D-42); NFKC sẽ biến chúng thành chữ thường
    text = SCRIPT_KEEP.sub(lambda m: m.group(0) if m.group(1) else unicodedata.normalize("NFKC", m.group(0)), text)
    # TeX font encoding: dấu “ bị trích thành "\" ngay trước chữ (\How → “How)
    text, n = re.subn(r"\\(?=[A-Za-zÀ-ỹ])", "“", text)
    stats.tex_quotes += n
    # Glyph mã hex của font tiêu đề: "/x35/x2E/x33 /x48/x61…" → "5.3 Ha…" (chỉ khi ≥2 mã liên tiếp)
    text, n = GLYPH_HEX_RUN.subn(
        lambda m: re.sub(r"/x([0-9A-Fa-f]{2})", lambda g: chr(int(g.group(1), 16)), m.group(0)), text
    )
    stats.glyph_hex_runs += n
    # Dấu ba chấm của TeX (\ldots) bị trích thành ": : :"
    text, n = re.subn(r":(?: :){2,}", "…", text)
    stats.tex_ellipses += n
    return re.sub(r"[ \t]+", " ", text)


def _edge_lines(lines: list[str]) -> list[str]:
    body = [ln for ln in lines if ln.strip()]
    return body[:2] + body[-2:]


def clean_pages(pages: list[tuple[str, int, str]]) -> tuple[list[tuple[str, int, str]], CleaningStats]:
    """pages: [(locator_type, locator_value, raw_text)] → cùng thứ tự, text đã làm sạch."""
    stats = CleaningStats()
    basic = [(t, n, _basic(raw, stats)) for t, n, raw in pages]

    # 1) Header/footer lặp: dòng đầu/cuối trang có cùng chữ ký xuất hiện ở ≥ HEADER_MIN_PAGES trang
    sig_count: Counter[str] = Counter()
    for _, _, text in basic:
        sig_count.update({_signature(ln) for ln in _edge_lines(text.splitlines()) if _signature(ln) not in ("", "#")})
    repeated = {s for s, c in sig_count.items() if c >= HEADER_MIN_PAGES and len(s) <= 120}

    # Từ vựng của toàn tài liệu để quyết định nối gạch nối / chữ hoa bị tách (dựa trên bằng chứng trong tài liệu)
    vocab = Counter(w.lower() for _, _, text in basic for w in WORD.findall(text))
    split_count = Counter(m.group(2).lower() for _, _, text in basic for m in SPLIT_CAPITAL.finditer(text))

    out: list[tuple[str, int, str]] = []
    for loc_type, loc_value, text in basic:
        lines = text.splitlines()
        body_idx = [i for i, ln in enumerate(lines) if ln.strip()]
        edges = set(body_idx[:2] + body_idx[-2:])
        kept = []
        for i, ln in enumerate(lines):
            if i in edges and PAGE_NUMBER_LINE.match(ln):
                stats.page_number_lines += 1
                continue
            if i in edges and _signature(ln) in repeated:
                stats.header_footer_lines += 1
                continue
            if FIGURE_RESIDUE.match(ln.strip()):
                stats.figure_residue_lines += 1
                continue
            kept.append(ln.rstrip())

        nonempty = [k for k in kept if k.strip()]
        # Trang mục lục / chỉ mục cuối sách: điều hướng, không phải nội dung học → không đưa vào index
        if sum(1 for ln in nonempty if TOC_DOT_LEADER.search(ln)) >= max(3, len(nonempty) // 3):
            stats.toc_pages.append(loc_value)
            out.append((loc_type, loc_value, ""))
            continue
        if len(nonempty) >= 10 and sum(1 for ln in nonempty if INDEX_LINE.match(ln.strip())) >= len(nonempty) // 2:
            stats.index_pages.append(loc_value)
            out.append((loc_type, loc_value, ""))
            continue

        text = "\n".join(kept)

        # 2) Gạch nối cuối dòng: "exam-\nple" → "example" nếu từ ghép có trong tài liệu; nếu không giữ gạch nối
        def join_hyphen(m: re.Match[str]) -> str:
            left, right = m.group(1), m.group(2)
            stats.hyphen_joins += 1
            return left + right if vocab[(left + right).lower()] else f"{left}-{right}"

        text = re.sub(r"([A-Za-zÀ-ỹ]+)-\n([a-zà-ỹ]+)", join_hyphen, text)

        # 3) Chữ hoa bị tách "F undamentals": chỉ nối khi phần sau KHÔNG bao giờ đứng riêng như một từ ở chỗ khác
        #    trong tài liệu ("A graph" giữ nguyên vì "graph" xuất hiện độc lập nhiều lần)
        def join_capital(m: re.Match[str]) -> str:
            rest = m.group(2).lower()
            if vocab[rest] <= split_count[rest]:
                stats.split_capitals += 1
                return m.group(1) + m.group(2)
            return m.group(0)

        text = SPLIT_CAPITAL.sub(join_capital, text)

        # 4) Chỉ nối dòng bị ngắt giữa câu; giữ xuống dòng ở tiêu đề, mục đánh số, DEFINITION/THEOREM…, cuối câu
        out.append((loc_type, loc_value, _reflow(text)))
    return out, stats


def _starts_block(line: str) -> bool:
    return bool(BLOCK_START.match(line))


def _is_heading(line: str) -> bool:
    return bool(SECTION_HEADING.match(line)) and len(line) <= 90 and not line.endswith((".", ",", ";"))


def _reflow(text: str) -> str:
    """Nối các dòng bị PDF ngắt cứng giữa câu thành đoạn, nhưng giữ cấu trúc để người đọc/nguồn dễ đọc."""
    blocks: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        lines = [ln.strip() for ln in para.splitlines() if ln.strip()]
        current, prev = "", ""
        for ln in lines:
            if not current:
                current, prev = ln, ln
                continue
            # prev = dòng PDF gốc ngay trước (không phải khối đã nối) — dòng ngắn kết thúc câu thường là hết đoạn
            new_block = (
                _is_heading(ln)
                or _is_heading(prev)
                or _starts_block(ln)
                or (prev.endswith((".", "?", "!", ":")) and ln[:1].isupper() and len(prev) < 60)
            )
            prev = ln
            current = current + ("\n" if new_block else " ") + ln
        if current:
            blocks.append(current)
    return "\n\n".join(blocks)
