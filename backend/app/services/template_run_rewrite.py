from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

from app.services.rich_text import RichTextRenderResult, normalize_email_html


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
            marks = _collect_marks(text_node, element)
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


def apply_template_run_replacements(
    document: TemplateRunDocument,
    replacements: list[dict[str, object]],
) -> RichTextRenderResult:
    segment_map = {segment.segment_id: segment for segment in document.segments}
    applied_count = 0
    diagnostics: Counter[str] = Counter()
    invalid_segment_ids: list[str] = []
    invalid_run_refs: list[str] = []

    if not replacements:
        diagnostics["empty_replacements"] += 1

    for replacement in replacements:
        if not isinstance(replacement, dict):
            diagnostics["invalid_replacement"] += 1
            continue
        segment_id = replacement.get("segment_id")
        if not isinstance(segment_id, str):
            diagnostics["invalid_segment_id"] += 1
            continue
        segment = segment_map.get(segment_id)
        if segment is None:
            diagnostics["unknown_segment_id"] += 1
            _append_sample(invalid_segment_ids, segment_id)
            continue

        run_map = {run.run_id: run for run in segment.runs}
        raw_runs = replacement.get("runs")
        if not isinstance(raw_runs, list):
            diagnostics["invalid_runs"] += 1
            continue
        for run_replacement in raw_runs:
            if not isinstance(run_replacement, dict):
                diagnostics["invalid_run_replacement"] += 1
                continue
            run_id = run_replacement.get("run_id")
            text = run_replacement.get("text")
            if not isinstance(run_id, str) or not isinstance(text, str):
                diagnostics["invalid_run_payload"] += 1
                continue
            run = run_map.get(run_id)
            if run is None:
                diagnostics["unknown_run_id"] += 1
                _append_sample(invalid_run_refs, f"{segment_id}/{run_id}")
                continue
            if not _replacement_preserves_placeholders(run, text):
                diagnostics["placeholder_violation"] += 1
                continue
            document.nodes[run.node_index].replace_with(_restore_placeholders(text, document.placeholders))
            applied_count += 1

    if applied_count == 0:
        raise ValueError(_format_no_replacement_error(diagnostics, invalid_segment_ids, invalid_run_refs))

    return normalize_email_html(str(document.soup))


def _append_sample(samples: list[str], value: str, *, limit: int = 3) -> None:
    if value in samples or len(samples) >= limit:
        return
    samples.append(value)


def _format_no_replacement_error(
    diagnostics: Counter[str],
    invalid_segment_ids: list[str],
    invalid_run_refs: list[str],
) -> str:
    details: list[str] = []
    if diagnostics["empty_replacements"]:
        details.append("replacements 为空")
    if invalid_segment_ids:
        details.append(f"无效 segment_id: {', '.join(invalid_segment_ids)}")
    if invalid_run_refs:
        details.append(f"无效 run_id: {', '.join(invalid_run_refs)}")
    if diagnostics["placeholder_violation"]:
        details.append(f"占位符校验失败: {diagnostics['placeholder_violation']}")
    if diagnostics["invalid_replacement"]:
        details.append(f"无效 replacement 项: {diagnostics['invalid_replacement']}")
    if diagnostics["invalid_segment_id"]:
        details.append(f"缺失或非法 segment_id: {diagnostics['invalid_segment_id']}")
    if diagnostics["invalid_runs"]:
        details.append(f"缺失或非法 runs: {diagnostics['invalid_runs']}")
    if diagnostics["invalid_run_replacement"]:
        details.append(f"无效 run 项: {diagnostics['invalid_run_replacement']}")
    if diagnostics["invalid_run_payload"]:
        details.append(f"缺失或非法 run_id/text: {diagnostics['invalid_run_payload']}")
    if not details:
        return "模型未返回可用改写内容"
    return f"模型未返回可用改写内容（{'; '.join(details)}）"


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


def _collect_marks(text_node: NavigableString, container: Tag) -> list[str]:
    marks: list[str] = []
    for parent in text_node.parents:
        if not isinstance(parent, Tag):
            continue
        if parent is container:
            continue
        if parent.name in {"strong", "b"} or _style_has_weight(parent):
            if "strong" not in marks:
                marks.append("strong")
        if parent.name in {"em", "i"} or _style_has_italic(parent):
            if "emphasis" not in marks:
                marks.append("emphasis")
        if parent.name == "u" or _style_has_underline(parent):
            if "underline" not in marks:
                marks.append("underline")
        if parent.name == "a" and "link" not in marks:
            marks.append("link")
        if _has_inline_formatting(parent) and "style" not in marks:
            marks.append("style")
    return marks

def _has_inline_formatting(tag: Tag) -> bool:
    if tag.name == "font":
        return True

    style = str(tag.get("style", "")).lower()
    if not style:
        return False

    return bool(
        re.search(r"font-(?:family|size|weight)\s*:\s*[^;]+", style)
        or re.search(r"text-decoration(?:-line)?\s*:\s*underline\b", style)
        or re.search(r"font-style\s*:\s*(italic|oblique)\b", style)
        or re.search(r"color\s*:\s*[^;]+", style)
    )

def _style_has_weight(tag: Tag) -> bool:
    style = str(tag.get("style", "")).lower()
    return bool(re.search(r"font-weight\s*:\s*(bold|bolder|[7-9]00)\b", style))

def _style_has_italic(tag: Tag) -> bool:
    style = str(tag.get("style", "")).lower()
    return bool(re.search(r"font-style\s*:\s*(italic|oblique)\b", style))

def _style_has_underline(tag: Tag) -> bool:
    style = str(tag.get("style", "")).lower()
    return bool(re.search(r"text-decoration(?:-line)?\s*:\s*underline\b", style))


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


def _replacement_preserves_placeholders(run: TemplateRun, text: str) -> bool:
    expected_tokens = Counter(item["token"] for item in run.locked_placeholders)
    actual_tokens = Counter(re.findall(r"\[\[PH_\d+\]\]", text))
    return actual_tokens == expected_tokens


def _restore_placeholders(text: str, placeholders: dict[str, str]) -> str:
    restored = text
    for token, original in placeholders.items():
        restored = restored.replace(token, original)
    return restored
