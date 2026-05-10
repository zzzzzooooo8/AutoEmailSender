from __future__ import annotations

import unittest

from app.models import IdentityProfile, Professor
from app.services.outreach_templates import build_template_context
from app.services.template_draft_rewrite import (
    apply_draft_rewrite_replacements,
    build_draft_rewrite_document,
    select_dominant_font_and_size,
)


class TemplateDraftRewriteTests(unittest.TestCase):
    def test_build_draft_rewrite_document_extracts_blocks_and_style_spans(self) -> None:
        identity = IdentityProfile(
            id=1,
            name="张三",
            profile_name="张三",
            sender_name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        professor = Professor(
            id=1,
            name="李老师",
            email="prof@example.edu",
            research_direction="Information Extraction",
        )

        html = (
            '<p><strong>{{name}}</strong>老师，您好，<u>欢迎</u>您。</p>'
            '<table><tbody><tr><td>原表格</td></tr></tbody></table>'
        )

        document = build_draft_rewrite_document(html, build_template_context(identity, professor))

        self.assertEqual(len(document.blocks), 2)
        self.assertEqual(document.blocks[0].segment_id, "seg_1")
        self.assertEqual(document.blocks[0].type, "paragraph")
        self.assertEqual(document.blocks[0].text, "李老师老师，您好，欢迎您。")
        self.assertEqual(
            [
                {"text": span.text, "marks": span.marks}
                for span in document.blocks[0].style_spans
            ],
            [
                {"text": "李老师", "marks": ["strong"]},
                {"text": "欢迎", "marks": ["underline"]},
            ],
        )

    def test_build_draft_rewrite_document_keeps_table_fragment_untouched(self) -> None:
        identity = IdentityProfile(
            id=1,
            name="张三",
            profile_name="张三",
            sender_name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        professor = Professor(
            id=1,
            name="李老师",
            email="prof@example.edu",
            research_direction="Information Extraction",
        )

        html = (
            "<p>李老师，您好。</p>"
            '<table style="border-collapse:collapse"><tbody><tr><td>原表格</td></tr></tbody></table>'
        )

        document = build_draft_rewrite_document(html, build_template_context(identity, professor))

        self.assertEqual(document.blocks[1].type, "table")
        self.assertEqual(
            document.blocks[1].html_fragment,
            '<table style="border-collapse:collapse"><tbody><tr><td>原表格</td></tr></tbody></table>',
        )


    def test_select_dominant_font_and_size_uses_visible_char_count(self) -> None:
        html = (
            '<p style="font-family:SimSun;font-size:12pt">短句。</p>'
            '<p style="font-family:Arial;font-size:14pt">这是一段明显更长的正文文本。</p>'
        )

        style = select_dominant_font_and_size(html)

        self.assertEqual(style.font_family, "Arial")
        self.assertEqual(style.font_size, "14pt")

    def test_apply_draft_rewrite_replacements_renders_runs_and_keeps_table(self) -> None:
        identity = IdentityProfile(
            id=1,
            name="张三",
            profile_name="张三",
            sender_name="张三",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="llm",
        )
        professor = Professor(
            id=1,
            name="李老师",
            email="prof@example.edu",
            research_direction="Information Extraction",
        )

        document = build_draft_rewrite_document(
            (
                "<p>李老师，您好：</p>"
                '<table style="border-collapse:collapse"><tbody><tr><td>原表格</td></tr></tbody></table>'
            ),
            build_template_context(identity, professor),
        )

        result = apply_draft_rewrite_replacements(
            document,
            [
                {
                    "segment_id": "seg_1",
                    "runs": [
                        {"text": "李老师，您好："},
                        {"text": "欢迎", "marks": ["underline"]},
                    ],
                }
            ],
        )

        self.assertIn("<u>欢迎</u>", result.html)
        self.assertIn("<table", result.html)
        self.assertIn("原表格", result.text)


if __name__ == "__main__":
    unittest.main()
