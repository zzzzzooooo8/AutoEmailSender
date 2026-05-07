import unittest

from app.services.template_run_rewrite import build_template_run_document


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


if __name__ == "__main__":
    unittest.main()
