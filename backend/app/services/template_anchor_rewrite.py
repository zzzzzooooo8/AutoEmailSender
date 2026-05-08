from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.template_run_rewrite import TemplateRun, TemplateRunDocument, TemplateSegment


SIGNIFICANT_MARKS = {"strong", "emphasis", "underline", "link", "placeholder"}
PLACEHOLDER_TOKEN_PATTERN = re.compile(r"\[\[PH_\d+\]\]")


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
                marks=["placeholder"],
                locked_placeholders=[placeholder_by_token[token]],
            ),
        )
        parts.append(f"[[{anchor_id}]]")
        cursor = match.end()
    parts.append(run.text[cursor:])


def _can_merge_anchor_run(previous: TemplateRun, current: TemplateRun) -> bool:
    return previous.marks == current.marks and previous.locked_placeholders == current.locked_placeholders == []
