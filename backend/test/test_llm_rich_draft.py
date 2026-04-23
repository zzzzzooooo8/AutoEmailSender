import unittest

from app.services.llm_runtime import DraftGenerationResult, parse_structured_result


class LLMRichDraftTest(unittest.TestCase):
    def test_draft_generation_parses_rich_body_json(self) -> None:
        result = parse_structured_result(
            """
            {
              "subject": "申请交流科研方向",
              "rich_body": {
                "type": "doc",
                "blocks": [
                  {
                    "type": "paragraph",
                    "children": [
                      {"type": "text", "text": "王老师您好，"},
                      {
                        "type": "strong",
                        "children": [{"type": "text", "text": "我很关注您的工作"}]
                      }
                    ]
                  }
                ]
              },
              "suggested_material_ids": [1]
            }
            """,
            DraftGenerationResult,
        )

        self.assertEqual(result.body_text, "王老师您好，我很关注您的工作")
        self.assertEqual(
            result.body_html,
            "<p>王老师您好，<strong>我很关注您的工作</strong></p>",
        )
