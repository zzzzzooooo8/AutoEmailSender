from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

from app.services.outreach_templates import render_template_string

PLACEHOLDER_PATTERN = re.compile(r"\{\{[a-zA-Z0-9_]+\}\}")

SEGMENT_TAG_NAMES = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "table"}


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
    blocks: list[DraftRewriteSourceBlock] = []

    for index, element in enumerate(_iter_segment_elements(soup), start=1):
        segment_id = f"seg_{index}"
        if element.name == "table":
            blocks.append(
                DraftRewriteSourceBlock(
                    segment_id=segment_id,
                    type="table",
                    text=_extract_visible_text(element, context),
                    html_fragment=str(element),
                ),
            )
            continue

        text_parts: list[str] = []
        style_spans: list[DraftRewriteStyleSpan] = []
        for text_node in element.find_all(string=True, recursive=True):
            if not isinstance(text_node, NavigableString):
                continue
            rendered_text = render_template_string(str(text_node), context)
            if not rendered_text:
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


def _extract_visible_text(element: Tag, context: dict[str, str]) -> str:
    rendered = render_template_string(element.get_text("", strip=False), context)
    return rendered.strip()
