from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from html import escape

from bs4 import BeautifulSoup, NavigableString, Tag

from app.services.rich_text import RichTextRenderResult, normalize_email_html
from app.services.template_run_rewrite import TemplateRun, TemplateRunDocument, TemplateSegment


SIGNIFICANT_MARKS = {"strong", "emphasis", "underline", "link", "placeholder"}
PLACEHOLDER_TOKEN_PATTERN = re.compile(r"\[\[PH_\d+\]\]")
ANCHOR_TOKEN_PATTERN = re.compile(r"\[\[A\d+\]\]")


@dataclass(slots=True)
class TemplateAnchor:
    anchor_id: str
    text: str
    segment_id: str
    source_runs: list[str]
    marks: list[str] = field(default_factory=list)
    locked_placeholders: list[dict[str, str]] = field(default_factory=list)


@dataclass(slots=True)
class AnchoredTemplateSegment:
    segment_id: str
    role: str
    rewrite_text: str
    anchors: list[TemplateAnchor]


@dataclass(slots=True)
class AnchoredTemplateDocument:
    segments: list[AnchoredTemplateSegment]


def build_anchored_template_document(document: TemplateRunDocument) -> AnchoredTemplateDocument:
    return AnchoredTemplateDocument(
        segments=[_build_anchored_segment(segment) for segment in document.segments],
    )


def _build_anchored_segment(segment: TemplateSegment) -> AnchoredTemplateSegment:
    anchors: list[TemplateAnchor] = []
    parts: list[str] = []
    index = 0

    while index < len(segment.runs):
        run = segment.runs[index]
        if run.locked_placeholders:
            _append_placeholder_run_parts(segment, run, anchors, parts)
            index += 1
            continue
        if not _is_anchor_run(run):
            parts.append(run.text)
            index += 1
            continue

        group = [run]
        index += 1
        while index < len(segment.runs) and _can_merge_anchor_run(group[-1], segment.runs[index]):
            group.append(segment.runs[index])
            index += 1

        anchor_id = f"A{len(anchors) + 1}"
        anchors.append(
            TemplateAnchor(
                anchor_id=anchor_id,
                text="".join(item.text for item in group),
                segment_id=segment.segment_id,
                source_runs=[item.run_id for item in group],
                marks=list(group[0].marks),
                locked_placeholders=[
                    placeholder
                    for item in group
                    for placeholder in item.locked_placeholders
                ],
            ),
        )
        parts.append(f"[[{anchor_id}]]")

    return AnchoredTemplateSegment(
        segment_id=segment.segment_id,
        role=segment.role,
        rewrite_text="".join(parts),
        anchors=anchors,
    )


def _is_anchor_run(run: TemplateRun) -> bool:
    return bool(set(run.marks) & SIGNIFICANT_MARKS)


def _append_placeholder_run_parts(
    segment: TemplateSegment,
    run: TemplateRun,
    anchors: list[TemplateAnchor],
    parts: list[str],
) -> None:
    cursor = 0
    placeholder_by_token = {
        placeholder["token"]: placeholder
        for placeholder in run.locked_placeholders
    }
    for match in PLACEHOLDER_TOKEN_PATTERN.finditer(run.text):
        parts.append(run.text[cursor:match.start()])
        token = match.group(0)
        anchor_id = f"A{len(anchors) + 1}"
        anchors.append(
            TemplateAnchor(
                anchor_id=anchor_id,
                text=token,
                segment_id=segment.segment_id,
                source_runs=[run.run_id],
                marks=list(run.marks),
                locked_placeholders=[placeholder_by_token[token]],
            ),
        )
        parts.append(f"[[{anchor_id}]]")
        cursor = match.end()
    parts.append(run.text[cursor:])


def _can_merge_anchor_run(previous: TemplateRun, current: TemplateRun) -> bool:
    return previous.marks == current.marks and previous.locked_placeholders == current.locked_placeholders == []


def apply_anchored_template_replacements(
    document: TemplateRunDocument,
    anchored_document: AnchoredTemplateDocument,
    replacements: list[dict[str, object]],
) -> RichTextRenderResult:
    anchored_map = {segment.segment_id: segment for segment in anchored_document.segments}
    replacement_map = _validate_replacements(anchored_map, replacements)

    for segment in document.segments:
        anchored_segment = anchored_map.get(segment.segment_id)
        if anchored_segment is None:
            continue
        replacement_text = replacement_map.get(segment.segment_id)
        if replacement_text is None:
            continue
        _replace_segment_contents(document, segment, anchored_segment, replacement_text)

    return normalize_email_html(str(document.soup))


def _validate_replacements(
    anchored_map: dict[str, AnchoredTemplateSegment],
    replacements: list[dict[str, object]],
) -> dict[str, str]:
    if not replacements:
        raise ValueError("模型未返回可用改写内容（replacements 为空）")

    replacement_map: dict[str, str] = {}
    for item in replacements:
        if not isinstance(item, dict):
            raise ValueError("模型未返回可用改写内容（无效 replacement 项）")
        segment_id = item.get("segment_id")
        text = item.get("text")
        if not isinstance(segment_id, str) or not isinstance(text, str):
            raise ValueError("模型未返回可用改写内容（缺失或非法 segment_id/text）")
        anchored_segment = anchored_map.get(segment_id)
        if anchored_segment is None:
            raise ValueError(f"模型未返回可用改写内容（无效 segment_id: {segment_id}）")
        _validate_anchor_tokens(anchored_segment, text)
        replacement_map[segment_id] = text
    return replacement_map


def _validate_anchor_tokens(segment: AnchoredTemplateSegment, text: str) -> None:
    expected = [anchor.anchor_id for anchor in segment.anchors]
    actual = [token[2:-2] for token in ANCHOR_TOKEN_PATTERN.findall(text)]
    for anchor_id in expected:
        if anchor_id not in actual:
            raise ValueError(f"锚点缺失: {segment.segment_id}/{anchor_id}")
    for anchor_id in actual:
        if anchor_id not in expected:
            raise ValueError(f"未知锚点: {segment.segment_id}/{anchor_id}")
    actual_positions = [expected.index(anchor_id) for anchor_id in actual]
    if actual_positions != sorted(actual_positions):
        raise ValueError(f"锚点顺序错误: {segment.segment_id}")


def _replace_segment_contents(
    document: TemplateRunDocument,
    segment: TemplateSegment,
    anchored_segment: AnchoredTemplateSegment,
    text: str,
) -> None:
    container = _find_segment_container(document.nodes[segment.runs[0].node_index])
    anchor_html = _anchor_html_map(document, segment, anchored_segment)
    fragment_html = _render_replacement_fragment(text, anchor_html)
    fragment = BeautifulSoup(fragment_html, "html.parser")
    container.clear()
    for child in list(fragment.contents):
        container.append(copy.copy(child))


def _find_segment_container(node: NavigableString):
    for parent in node.parents:
        if getattr(parent, "name", None) in SEGMENT_CONTAINER_NAMES:
            return parent
    raise ValueError("无法定位模板段落容器")


def _anchor_html_map(
    document: TemplateRunDocument,
    segment: TemplateSegment,
    anchored_segment: AnchoredTemplateSegment,
) -> dict[str, str]:
    run_map = {run.run_id: run for run in segment.runs}
    html_by_anchor: dict[str, str] = {}
    for anchor in anchored_segment.anchors:
        if anchor.locked_placeholders:
            run = run_map[anchor.source_runs[0]]
            html_by_anchor[anchor.anchor_id] = _render_placeholder_anchor_html(document, run, anchor)
            continue
        html_parts: list[str] = []
        for run_id in anchor.source_runs:
            run = run_map[run_id]
            node = document.nodes[run.node_index]
            parent = node.parent
            html_parts.append(str(parent) if parent is not None else escape(str(node)))
        html_by_anchor[anchor.anchor_id] = "".join(html_parts)
    return html_by_anchor


SEGMENT_CONTAINER_NAMES = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"}


def _render_placeholder_anchor_html(
    document: TemplateRunDocument,
    run: TemplateRun,
    anchor: TemplateAnchor,
) -> str:
    original = anchor.locked_placeholders[0]["original"]
    node = document.nodes[run.node_index]
    parent = node.parent
    if (
        str(node) == original
        and isinstance(parent, Tag)
        and parent.name not in SEGMENT_CONTAINER_NAMES
    ):
        return str(parent)
    return escape(original)


def _render_replacement_fragment(text: str, anchor_html: dict[str, str]) -> str:
    parts: list[str] = []
    cursor = 0
    for match in ANCHOR_TOKEN_PATTERN.finditer(text):
        parts.append(escape(text[cursor:match.start()]))
        anchor_id = match.group(0)[2:-2]
        parts.append(anchor_html[anchor_id])
        cursor = match.end()
    parts.append(escape(text[cursor:]))
    return "".join(parts)
