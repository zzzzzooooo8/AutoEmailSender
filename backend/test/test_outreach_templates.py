from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from bs4 import BeautifulSoup


class OutreachTemplateImportTests(unittest.TestCase):
    FIXTURE_DIR = Path(__file__).with_name("fixtures") / "template_samples"

    def test_html_to_text_keeps_inline_formatting_in_same_paragraph(self) -> None:
        from app.services.outreach_templates import html_to_text

        html = (
            "<p>尊敬的{{name}}教授：</p>"
            "<p>我是王俊杰，<strong>以专业第一的成绩获得了推免资格</strong>。现在联系您。</p>"
            "<p>此致</p>"
        )

        self.assertEqual(
            html_to_text(html),
            "尊敬的{{name}}教授：\n\n"
            "我是王俊杰，以专业第一的成绩获得了推免资格。现在联系您。\n\n"
            "此致",
        )

    def test_docx_import_prefers_html_and_raw_text_from_source(self) -> None:
        from app.services.outreach_templates import import_outreach_template_file

        converted_html = (
            "<p><strong>老师您好：</strong></p>"
            "<p>我是张三，想向您请教科研方向。</p>"
            "<ul><li>已附上简历</li><li>期待交流</li></ul>"
        )
        extracted_text = "老师您好：\n\n我是张三，想向您请教科研方向。\n\n已附上简历\n\n期待交流"

        with patch(
            "app.services.outreach_templates._convert_docx_template_to_html",
            return_value=converted_html,
        ), patch(
            "app.services.outreach_templates._extract_docx_template_to_text",
            return_value=extracted_text,
            create=True,
        ):
            result = import_outreach_template_file("template.docx", b"fake-docx-content")

        self.assertIsNone(result.subject)
        self.assertEqual(result.format_name, "docx")
        self.assertEqual(result.body_html, converted_html)
        self.assertEqual(result.body_text, extracted_text)

    def test_docx_fixture_import_builds_email_ready_html(self) -> None:
        from app.services.outreach_templates import import_outreach_template_file

        fixture = self.FIXTURE_DIR / "taoci.docx"
        result = import_outreach_template_file(fixture.name, fixture.read_bytes())

        self.assertEqual(result.format_name, "docx")
        self.assertIn("font-family", result.body_html)
        self.assertIn("line-height:1.5", result.body_html)
        self.assertIn("text-indent:2em", result.body_html)
        self.assertIn("border-collapse:collapse", result.body_html)
        self.assertIn("<table", result.body_html)
        self.assertIn("{{name}}", result.body_html)
        self.assertIn("推免资格", result.body_text)
        self.assertIn("王俊杰，以专业第一的成绩获得了推免资格。现在联系您或许有些晚了", result.body_text)
        self.assertNotIn("推免资格\n\n。现在联系您", result.body_text)

    def test_docx_fixture_keeps_reference_html_block_structure(self) -> None:
        from app.services.outreach_templates import import_outreach_template_file

        docx_fixture = self.FIXTURE_DIR / "taoci.docx"
        htm_fixture = self.FIXTURE_DIR / "taoci.htm"
        result = import_outreach_template_file(docx_fixture.name, docx_fixture.read_bytes())
        imported_soup = BeautifulSoup(result.body_html, "html.parser")

        reference_html = htm_fixture.read_text(encoding="gb18030", errors="ignore")
        reference_soup = BeautifulSoup(reference_html, "html.parser")
        reference_body = reference_soup.body or reference_soup

        self.assertEqual(
            len(imported_soup.find_all("table")),
            len(reference_body.find_all("table")),
        )
        self.assertEqual(
            len(imported_soup.find_all("p")),
            len(reference_body.find_all("p")),
        )
        self.assertIn("（一）个人介绍", imported_soup.get_text(" ", strip=True))
        self.assertIn("（二）未来规划", imported_soup.get_text(" ", strip=True))

    def test_rendered_imported_docx_html_keeps_email_styles(self) -> None:
        from app.models import IdentityProfile, Professor
        from app.services.outreach_templates import (
            import_outreach_template_file,
            render_outreach_template,
        )

        fixture = self.FIXTURE_DIR / "taoci.docx"
        imported = import_outreach_template_file(fixture.name, fixture.read_bytes())
        identity = IdentityProfile(
            name="王俊杰",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="sender@example.com",
            smtp_password="secret",
            default_language="zh-CN",
            outreach_generation_mode="template",
        )
        professor = Professor(
            name="李老师",
            email="prof@example.edu",
            title="Professor",
            university="Example University",
            school="School of Computing",
            department="Computer Science",
            research_direction="Information Extraction",
        )

        rendered = render_outreach_template(
            identity,
            professor,
            subject_template="申请与{{name}}老师交流",
            body_text_template=imported.body_text,
            body_html_template=imported.body_html,
        )

        self.assertIn("李老师", rendered.body_html)
        self.assertIn("font-family", rendered.body_html)
        self.assertIn("text-indent:2em", rendered.body_html)
        self.assertIn("border-collapse:collapse", rendered.body_html)
        self.assertIn("李老师", rendered.body_text)

    def test_template_context_uses_sender_name_field(self) -> None:
        from app.models import IdentityProfile, Professor
        from app.services.outreach_templates import render_outreach_template

        identity = IdentityProfile(
            name="内部配置",
            profile_name="博士申请配置",
            sender_name="王同学",
            email_address="sender@example.com",
            smtp_host="smtp.example.com",
            smtp_username="sender@example.com",
            smtp_password="secret",
        )
        professor = Professor(name="李老师", email="li@example.edu")

        rendered = render_outreach_template(
            identity,
            professor,
            subject_template="申请与{{name}}老师交流",
            body_text_template="{{name}}老师您好，我是{{sender_name}}。",
            body_html_template="<p>{{name}}老师您好，我是{{sender_name}}。</p>",
        )

        self.assertEqual(rendered.subject, "申请与李老师老师交流")
        self.assertIn("我是王同学", rendered.body_text)
        self.assertIn("我是王同学", rendered.body_html)


if __name__ == "__main__":
    unittest.main()
