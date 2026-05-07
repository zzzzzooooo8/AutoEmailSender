import unittest

from app.services.template_run_rewrite import (
    apply_template_run_replacements,
    build_template_run_document,
)


class TemplateRunRewriteTests(unittest.TestCase):
    def test_extracts_runs_and_locks_placeholders(self) -> None:
        document = build_template_run_document(
            '<p style="font-family:SimSun;font-size:12pt">'
            '我对您的 <strong>{{research_direction}}</strong> 方向很感兴趣。'
            '</p>',
        )

        self.assertEqual(document.segments[0].segment_id, "seg_1")
        self.assertEqual(document.segments[0].role, "paragraph")
        self.assertEqual(
            [(run.run_id, run.text, run.marks) for run in document.segments[0].runs],
            [
                ("run_1", "我对您的 ", []),
                ("run_2", "[[PH_1]]", ["strong", "placeholder"]),
                ("run_3", " 方向很感兴趣。", []),
            ],
        )
        self.assertEqual(document.placeholders["[[PH_1]]"], "{{research_direction}}")

    def test_applies_replacements_preserving_styles_and_table(self) -> None:
        document = build_template_run_document(
            '<p style="font-family:SimSun;font-size:12pt">我对您的 '
            '<strong>{{research_direction}}</strong> 方向很感兴趣。</p>'
            '<table style="border-collapse:collapse"><tbody><tr>'
            '<td style="border:1px solid #ccc">研究经历</td>'
            '<td style="font-size:11pt">我做过信息抽取项目。</td>'
            '</tr></tbody></table>',
        )

        result = apply_template_run_replacements(
            document,
            [
                {
                    "segment_id": "seg_1",
                    "runs": [
                        {"run_id": "run_1", "text": "我近期关注到您在 "},
                        {"run_id": "run_2", "text": "[[PH_1]]"},
                        {"run_id": "run_3", "text": " 方向上的研究。"},
                    ],
                },
                {
                    "segment_id": "seg_3",
                    "runs": [
                        {
                            "run_id": "run_1",
                            "text": "我做过医学 NLP 与信息抽取项目。",
                        },
                    ],
                },
            ],
        )

        self.assertIn('style="font-family:SimSun;font-size:12pt"', result.html)
        self.assertIn("<strong>{{research_direction}}</strong>", result.html)
        self.assertIn("<table", result.html)
        self.assertIn('style="font-size:11pt"', result.html)
        self.assertIn("我做过医学 NLP 与信息抽取项目。", result.text)

    def test_invalid_placeholder_replacement_keeps_original_run(self) -> None:
        document = build_template_run_document(
            "<p>我是<strong>{{sender_name}}</strong>，您好。</p>",
        )

        result = apply_template_run_replacements(
            document,
            [
                {
                    "segment_id": "seg_1",
                    "runs": [
                        {"run_id": "run_1", "text": "我是"},
                        {"run_id": "run_2", "text": "张三"},
                        {"run_id": "run_3", "text": "，想和您交流。"},
                    ],
                },
            ],
        )

        self.assertIn("<strong>{{sender_name}}</strong>", result.html)
        self.assertIn("想和您交流", result.text)


if __name__ == "__main__":
    unittest.main()
