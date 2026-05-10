from __future__ import annotations

import re
from dataclasses import dataclass, field
from html import escape

from bs4 import BeautifulSoup, NavigableString, Tag

from app.services.rich_text import RichTextRenderResult, normalize_email_html

PLACEHOLDER_PATTERN = re.compile(r"\{\{[a-zA-Z0-9_]+\}\}")

SEGMENT_TAG_NAMES = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "table"}


@dataclass(slots=True)
class DraftRewriteFontStyle:
    font_family: str | None
    font_size: str | None


@dataclass(slots=True)
class DraftRewriteStyleSpan:
    text: str
    marks: list[str] = field(default_factory=list)


@dataclass(slots=True)
class DraftRewriteSourceBlock:
    segment_id: str
    type: str
    text: str
    style_spans: list[DraftRewriteStyleSpan] = field(default_factory=list)
    html_fragment: str | None = None


@dataclass(slots=True)
class DraftRewriteDocument:
    html: str
    blocks: list[DraftRewriteSourceBlock]


def build_draft_rewrite_document(html: str, context: dict[str, str]) -> DraftRewriteDocument:
    soup = BeautifulSoup(html.strip(), "html.parser")
    _render_template_text_nodes(soup, context)
    blocks: list[DraftRewriteSourceBlock] = []

    for index, element in enumerate(_iter_segment_elements(soup), start=1):
        segment_id = f"seg_{index}"
        if element.name == "table":
            blocks.append(
                DraftRewriteSourceBlock(
                    segment_id=segment_id,
                    type="table",
                    text=element.get_text(" ", strip=True),
                    html_fragment=str(element),
                ),
            )
            continue

        text_parts: list[str] = []
        style_spans: list[DraftRewriteStyleSpan] = []
        for text_node in list(element.find_all(string=True, recursive=True)):
            if not isinstance(text_node, NavigableString):
                continue
            rendered_text = str(text_node)
            if not rendered_text.strip():
                continue
            text_parts.append(rendered_text)
            marks = _collect_marks(text_node, element)
            if marks:
                style_spans.append(
                    DraftRewriteStyleSpan(
                        text=rendered_text,
                        marks=marks,
                    ),
                )

        blocks.append(
            DraftRewriteSourceBlock(
                segment_id=segment_id,
                type=_segment_type(element),
                text="".join(text_parts),
                style_spans=style_spans,
            ),
        )

    return DraftRewriteDocument(html=str(soup), blocks=blocks)


def _iter_segment_elements(soup: BeautifulSoup) -> list[Tag]:
    elements: list[Tag] = []
    for tag in soup.find_all(SEGMENT_TAG_NAMES):
        if not isinstance(tag, Tag):
            continue
        if tag.name == "table":
            elements.append(tag)
            continue
        if tag.name == "li" and tag.find(["p", "h1", "h2", "h3", "h4", "h5", "h6"]):
            continue
        elements.append(tag)
    return elements


def _segment_type(element: Tag) -> str:
    if element.name == "table":
        return "table"
    if element.name == "li":
        return "list_item"
    if element.name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        return "heading"
    return "paragraph"


def _collect_marks(text_node: NavigableString, container: Tag) -> list[str]:
    marks: list[str] = []
    for parent in text_node.parents:
        if not isinstance(parent, Tag):
            continue
        if parent is container:
            continue
        if parent.name in {"strong", "b"} and "strong" not in marks:
            marks.append("strong")
        if parent.name in {"u"} and "underline" not in marks:
            marks.append("underline")
        if parent.name in {"em", "i"} and "emphasis" not in marks:
            marks.append("emphasis")
    return marks


def select_dominant_font_and_size(html: str) -> DraftRewriteFontStyle:
    soup = BeautifulSoup(html.strip(), "html.parser")
    counts: dict[tuple[str | None, str | None], int] = {}
    first_seen: dict[tuple[str | None, str | None], int] = {}
    order = 0

    for text_node in soup.find_all(string=True):
        if not isinstance(text_node, NavigableString):
            continue
        text = str(text_node).strip()
        if not text:
            continue
        family = _resolve_effective_font_family(text_node)
        size = _resolve_effective_font_size(text_node)
        key = (family, size)
        if key == (None, None):
            continue
        counts[key] = counts.get(key, 0) + len(text)
        if key not in first_seen:
            first_seen[key] = order
        order += 1

    if not counts:
        return DraftRewriteFontStyle(font_family=None, font_size=None)

    winner = max(counts, key=lambda key: (counts[key], -first_seen[key]))
    return DraftRewriteFontStyle(font_family=winner[0], font_size=winner[1])


def apply_draft_rewrite_replacements(
    document: DraftRewriteDocument,
    replacements: list[dict[str, object]],
) -> RichTextRenderResult:
    soup = BeautifulSoup(document.html, "html.parser")
    elements = _iter_segment_elements(soup)
    block_map = {block.segment_id: block for block in document.blocks}
    element_map = {block.segment_id: element for block, element in zip(document.blocks, elements)}
    applied_count = 0

    for replacement in replacements:
        if not isinstance(replacement, dict):
            continue
        segment_id = replacement.get("segment_id")
        runs = replacement.get("runs")
        if not isinstance(segment_id, str) or not isinstance(runs, list):
            continue
        block = block_map.get(segment_id)
        element = element_map.get(segment_id)
        if block is None or element is None or block.type == "table":
            continue

        fragment_html = "".join(_render_draft_run(run) for run in runs if isinstance(run, dict))
        fragment = BeautifulSoup(f"<div>{fragment_html}</div>", "html.parser")
        element.clear()
        for child in list(fragment.div.contents if fragment.div else []):
            element.append(child)
        applied_count += 1

    if applied_count == 0:
        raise ValueError("模型未返回可用改写内容")

    dominant_style = select_dominant_font_and_size(document.html)
    if dominant_style.font_family or dominant_style.font_size:
        _apply_dominant_font_style(soup, dominant_style)

    return normalize_email_html(str(soup))


def _render_template_text_nodes(soup: BeautifulSoup, context: dict[str, str]) -> None:
    for text_node in list(soup.find_all(string=True)):
        if not isinstance(text_node, NavigableString):
            continue
        rendered_text = _render_template_text(str(text_node), context)
        if rendered_text != str(text_node):
            text_node.replace_with(rendered_text)


def _render_template_text(text: str, context: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(0)[2:-2].strip()
        value = context.get(key)
        if value is None or value == "":
            return match.group(0)
        return value

    return PLACEHOLDER_PATTERN.sub(replace, text)


def _render_draft_run(run: dict[str, object]) -> str:
    text = escape(str(run.get("text", "")))
    raw_marks = run.get("marks")
    marks = raw_marks if isinstance(raw_marks, list) else []
    for mark in marks:
        if mark == "strong":
            text = f"<strong>{text}</strong>"
        elif mark == "underline":
            text = f"<u>{text}</u>"
        elif mark == "emphasis":
            text = f"<em>{text}</em>"
    return text


def _apply_dominant_font_style(soup: BeautifulSoup, style: DraftRewriteFontStyle) -> None:
    for tag in soup.find_all(True):
        if _is_within_table(tag):
            continue
        current_style = str(tag.get("style", ""))
        updated_style = _merge_font_style(current_style, style)
        if updated_style:
            tag["style"] = updated_style
        elif "style" in tag.attrs:
            del tag.attrs["style"]


def _is_within_table(tag: Tag) -> bool:
    for parent in tag.parents:
        if isinstance(parent, Tag) and parent.name == "table":
            return True
    return False


def _merge_font_style(style: str, dominant: DraftRewriteFontStyle) -> str:
    declarations: list[tuple[str, str]] = []
    for item in style.split(";"):
        if ":" not in item:
            continue
        key, value = item.split(":", 1)
        normalized_key = key.strip().lower()
        normalized_value = value.strip()
        if not normalized_key or not normalized_value:
            continue
        if normalized_key in {"font-family", "font-size"}:
            continue
        declarations.append((normalized_key, normalized_value))

    if dominant.font_family:
        declarations.append(("font-family", dominant.font_family))
    if dominant.font_size:
        declarations.append(("font-size", dominant.font_size))

    return ";".join(f"{key}:{value}" for key, value in declarations)


def _resolve_effective_font_family(text_node: NavigableString) -> str | None:
    for parent in text_node.parents:
        if not isinstance(parent, Tag):
            continue
        family = _extract_font_family(parent)
        if family:
            return family
    return None


def _resolve_effective_font_size(text_node: NavigableString) -> str | None:
    for parent in text_node.parents:
        if not isinstance(parent, Tag):
            continue
        size = _extract_font_size(parent)
        if size:
            return size
    return None


def _extract_font_family(tag: Tag) -> str | None:
    if tag.name == "font":
        face = str(tag.get("face", "")).strip()
        if face:
            return face.split(",")[0].strip().strip("'\"") or None

    style = str(tag.get("style", ""))
    match = re.search(r"font-family\s*:\s*([^;]+)", style, re.I)
    if match:
        family = match.group(1).split(",")[0].strip().strip("'\"")
        if family:
            return family
    return None


def _extract_font_size(tag: Tag) -> str | None:
    if tag.name == "font":
        size = str(tag.get("size", "")).strip()
        if size:
            return size

    style = str(tag.get("style", ""))
    match = re.search(r"font-size\s*:\s*([^;]+)", style, re.I)
    if match:
        size = match.group(1).strip()
        if size:
            return size
    return None
