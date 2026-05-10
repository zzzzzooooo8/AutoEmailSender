from __future__ import annotations

import unittest

from app.models import IdentityProfile, Professor
from app.services.outreach_templates import build_template_context
from app.services.template_draft_rewrite import build_draft_rewrite_document


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


if __name__ == "__main__":
    unittest.main()
