from __future__ import annotations

import unittest

from app.services.template_run_rewrite import build_template_run_document
from app.services.template_anchor_rewrite import build_anchored_template_document


class TemplateAnchorRewriteTests(unittest.TestCase):
    def test_build_anchored_document_groups_strong_runs_as_anchor(self) -> None:
        document = build_template_run_document(
            "<p>我是王俊杰，<strong>以专业第一的成绩获得</strong>"
            "<strong>了</strong><strong>推免资格</strong>。现在联系您或许有些晚了，附件中是我的简历。</p>",
        )

        anchored = build_anchored_template_document(document)
        segment = anchored.segments[0]

        self.assertEqual(
            segment.rewrite_text,
            "我是王俊杰，[[A1]]。现在联系您或许有些晚了，附件中是我的简历。",
        )
        self.assertEqual(len(segment.anchors), 1)
        self.assertEqual(segment.anchors[0].anchor_id, "A1")
        self.assertEqual(segment.anchors[0].text, "以专业第一的成绩获得了推免资格")
        self.assertEqual(segment.anchors[0].source_runs, ["run_2", "run_3", "run_4"])
        self.assertEqual(segment.anchors[0].marks, ["strong"])

    def test_build_anchored_document_keeps_placeholder_as_anchor(self) -> None:
        document = build_template_run_document("<p>尊敬的{{name}}教授：</p>")

        anchored = build_anchored_template_document(document)
        segment = anchored.segments[0]

        self.assertEqual(segment.rewrite_text, "尊敬的[[A1]]教授：")
        self.assertEqual(segment.anchors[0].text, "[[PH_1]]")
        self.assertEqual(segment.anchors[0].locked_placeholders, [{"token": "[[PH_1]]", "original": "{{name}}"}])
