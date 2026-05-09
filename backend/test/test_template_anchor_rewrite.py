from __future__ import annotations

import unittest

from app.services.template_run_rewrite import build_template_run_document
from app.services.template_anchor_rewrite import (
    apply_anchored_template_replacements,
    build_anchored_template_document,
)


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

    def test_build_anchored_document_does_not_anchor_plain_inline_style(self) -> None:
        document = build_template_run_document(
            '<p style="font-family:SimSun;font-size:12pt;color:#000000">'
            '<span style="font-family:SimSun">尊敬的</span>'
            '<span style="font-family:SimSun">{{name}}</span>'
            '<span style="font-family:SimSun">教授：</span>'
            "</p>",
        )

        anchored = build_anchored_template_document(document)
        segment = anchored.segments[0]

        self.assertEqual(segment.rewrite_text, "尊敬的[[A1]]教授：")
        self.assertEqual(len(segment.anchors), 1)
        self.assertEqual(segment.anchors[0].text, "[[PH_1]]")

    def test_apply_anchored_replacements_preserves_strong_anchor(self) -> None:
        document = build_template_run_document(
            "<p>我是王俊杰，<strong>以专业第一的成绩获得</strong>"
            "<strong>了</strong><strong>推免资格</strong>。现在联系您或许有些晚了，附件中是我的简历。</p>",
        )
        anchored = build_anchored_template_document(document)

        rendered = apply_anchored_template_replacements(
            document,
            anchored,
            [
                {
                    "segment_id": "seg_1",
                    "text": "我是王俊杰，[[A1]]。冒昧来信咨询，不知老师今年是否还有硕士招生名额？附件中是我的简历。",
                },
            ],
        )

        self.assertIn("<strong>", rendered.html)
        self.assertIn("以专业第一的成绩获得", rendered.html)
        self.assertIn("推免资格", rendered.html)
        self.assertIn("推免资格 。冒昧来信咨询", rendered.text)
        self.assertNotIn("推免资格冒昧", rendered.text)

    def test_apply_anchored_replacements_preserves_nested_style_bold(self) -> None:
        document = build_template_run_document(
            "<p>我是王俊杰，<span style=\"font-weight:bold;font-family:宋体\">"
            "<font face=\"宋体\">以专业第一的成绩获得</font></span>"
            "<span style=\"font-weight:bold;font-family:宋体\">"
            "<font face=\"宋体\">了</font></span>"
            "<span style=\"font-weight:bold;font-family:宋体\">"
            "<font face=\"宋体\">推免资格</font></span>。现在联系您。</p>",
        )
        anchored = build_anchored_template_document(document)

        self.assertIn("strong", anchored.segments[0].anchors[0].marks)
        self.assertIn("style", anchored.segments[0].anchors[0].marks)

        rendered = apply_anchored_template_replacements(
            document,
            anchored,
            [
                {
                    "segment_id": "seg_1",
                    "text": "我是王俊杰，[[A1]]。冒昧来信咨询。附件中是我的简历。",
                },
            ],
        )

        self.assertIn("font-weight:bold", rendered.html)
        self.assertIn("font-family:宋体", rendered.html)
        self.assertIn("以专业第一的成绩获得", rendered.html)
        self.assertIn("推免资格", rendered.html)
        self.assertIn("冒昧来信咨询", rendered.text)

    def test_apply_anchored_replacements_allows_plain_font_style_rewrite(self) -> None:
        document = build_template_run_document(
            '<p><font face="宋体" color="#333333">老师您好</font>，我是王俊杰。</p>',
        )
        anchored = build_anchored_template_document(document)

        self.assertEqual(anchored.segments[0].rewrite_text, "老师您好，我是王俊杰。")
        self.assertEqual(anchored.segments[0].anchors, [])

        rendered = apply_anchored_template_replacements(
            document,
            anchored,
            [
                {
                    "segment_id": "seg_1",
                    "text": "老师您好，冒昧来信咨询。",
                },
            ],
        )

        self.assertEqual(rendered.text, "老师您好，冒昧来信咨询。")

    def test_apply_anchored_replacements_rejects_missing_anchor(self) -> None:
        document = build_template_run_document("<p>尊敬的{{name}}教授：</p>")
        anchored = build_anchored_template_document(document)

        with self.assertRaisesRegex(ValueError, "锚点缺失: seg_1/A1"):
            apply_anchored_template_replacements(
                document,
                anchored,
                [{"segment_id": "seg_1", "text": "尊敬的教授："}],
            )

    def test_apply_anchored_replacements_rejects_reordered_anchor(self) -> None:
        document = build_template_run_document("<p><strong>A</strong> 普通 <em>B</em></p>")
        anchored = build_anchored_template_document(document)

        with self.assertRaisesRegex(ValueError, "锚点顺序错误: seg_1"):
            apply_anchored_template_replacements(
                document,
                anchored,
                [{"segment_id": "seg_1", "text": "[[A2]] 普通 [[A1]]"}],
            )

    def test_apply_anchored_replacements_rejects_duplicated_anchor(self) -> None:
        document = build_template_run_document("<p>我是<strong>王俊杰</strong>。</p>")
        anchored = build_anchored_template_document(document)

        with self.assertRaisesRegex(ValueError, "锚点重复: seg_1/A1"):
            apply_anchored_template_replacements(
                document,
                anchored,
                [{"segment_id": "seg_1", "text": "我是[[A1]][[A1]]。"}],
            )

    def test_apply_anchored_replacements_avoids_comma_boundary_artifact(self) -> None:
        document = build_template_run_document(
            "<p><span>以下是我的个人介绍和未来规划</span><span>，</span><span>附件中是我的简历。</span></p>",
        )
        anchored = build_anchored_template_document(document)

        rendered = apply_anchored_template_replacements(
            document,
            anchored,
            [{"segment_id": "seg_1", "text": "以下是我的个人情况与未来规划，附件中是我的简历。"}],
        )

        self.assertIn("未来规划，附件中", rendered.text)
        self.assertNotIn("未来规划。 ，", rendered.text)
        self.assertNotIn("未来规划，，", rendered.text)

    def test_apply_anchored_replacements_avoids_split_project_duplicate(self) -> None:
        document = build_template_run_document(
            "<p><span>④多模态谣言检测模型的对抗攻击与数据增强研究</span>"
            "<span>（</span><span>科研</span><span>项目）：基于文本风格改写方法。</span></p>",
        )
        anchored = build_anchored_template_document(document)

        rendered = apply_anchored_template_replacements(
            document,
            anchored,
            [{"segment_id": "seg_1", "text": "④多模态谣言检测模型的对抗攻击与数据增强研究（科研项目）：基于文本风格改写方法。"}],
        )

        self.assertIn("（科研项目）：", rendered.text)
        self.assertNotIn("科研科研项目", rendered.text)
