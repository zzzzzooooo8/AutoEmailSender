from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag


PLACEHOLDER_PATTERN = re.compile(r"\{\{[a-zA-Z0-9_]+\}\}")


@dataclass(slots=True)
class TemplateRun:
    run_id: str
    text: str
    marks: list[str] = field(default_factory=list)
    locked_placeholders: list[dict[str, str]] = field(default_factory=list)
    node_index: int = 0


@dataclass(slots=True)
class TemplateSegment:
    segment_id: str
    role: str
    runs: list[TemplateRun]


@dataclass(slots=True)
class TemplateRunDocument:
    html: str
    soup: BeautifulSoup
    segments: list[TemplateSegment]
    placeholders: dict[str, str]
    nodes: list[NavigableString]


def build_template_run_document(html: str) -> TemplateRunDocument:
    soup = BeautifulSoup(html.strip(), "html.parser")
    placeholders: dict[str, str] = {}
    nodes: list[NavigableString] = []
    segments: list[TemplateSegment] = []

    for element in _iter_segment_elements(soup):
        runs: list[TemplateRun] = []
        for text_node in element.find_all(string=True, recursive=True):
            if not isinstance(text_node, NavigableString):
                continue
            text = str(text_node)
            if not text.strip():
                continue
            node_index = len(nodes)
            nodes.append(text_node)
            run_text, run_placeholders = _lock_placeholders(text, placeholders)
            marks = _collect_marks(text_node)
            if run_placeholders and "placeholder" not in marks:
                marks.append("placeholder")
            runs.append(
                TemplateRun(
                    run_id=f"run_{len(runs) + 1}",
                    text=run_text,
                    marks=marks,
                    locked_placeholders=run_placeholders,
                    node_index=node_index,
                ),
            )
        if runs:
            segments.append(
                TemplateSegment(
                    segment_id=f"seg_{len(segments) + 1}",
                    role=_segment_role(element),
                    runs=runs,
                ),
            )

    return TemplateRunDocument(
        html=str(soup),
        soup=soup,
        segments=segments,
        placeholders=placeholders,
        nodes=nodes,
    )


def _iter_segment_elements(soup: BeautifulSoup) -> list[Tag]:
    segment_names = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"}
    elements: list[Tag] = []
    for tag in soup.find_all(segment_names):
        if not isinstance(tag, Tag):
            continue
        if tag.name in {"td", "th"} and tag.find(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"]):
            continue
        elements.append(tag)

    if elements:
        return elements

    body_text = soup.get_text("", strip=True)
    if not body_text:
        return []
    wrapper = soup.new_tag("p")
    wrapper.string = body_text
    soup.clear()
    soup.append(wrapper)
    return [wrapper]


def _segment_role(element: Tag) -> str:
    if element.name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        return "heading"
    if element.name == "li":
        return "list_item"
    if element.name in {"td", "th"}:
        return "table_cell"
    return "paragraph"


def _collect_marks(text_node: NavigableString) -> list[str]:
    marks: list[str] = []
    for parent in text_node.parents:
        if not isinstance(parent, Tag):
            continue
        if parent.name in {"strong", "b"} and "strong" not in marks:
            marks.append("strong")
        if parent.name in {"em", "i"} and "emphasis" not in marks:
            marks.append("emphasis")
        if parent.name == "u" and "underline" not in marks:
            marks.append("underline")
        if parent.name == "a" and "link" not in marks:
            marks.append("link")
    return marks


def _lock_placeholders(
    text: str,
    placeholders: dict[str, str],
) -> tuple[str, list[dict[str, str]]]:
    locked: list[dict[str, str]] = []

    def replace(match: re.Match[str]) -> str:
        original = match.group(0)
        for token, value in placeholders.items():
            if value == original:
                locked.append({"token": token, "original": original})
                return token
        token = f"[[PH_{len(placeholders) + 1}]]"
        placeholders[token] = original
        locked.append({"token": token, "original": original})
        return token

    return PLACEHOLDER_PATTERN.sub(replace, text), locked
