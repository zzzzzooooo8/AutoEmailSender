from __future__ import annotations

import unittest

from app.agents.faculty_crawler_agent import (
    _format_save_batch_result_for_model,
    _validate_professor_candidate_batch,
)


class FacultyCrawlerAgentSaveResultTests(unittest.TestCase):
    def test_format_save_batch_result_for_model_is_compact(self) -> None:
        result = _format_save_batch_result_for_model(
            {
                "batch_status": "saved",
                "attempted_count": 10,
                "saved_count": 10,
                "failed_count": 0,
                "failed_items": [],
                "total_saved_count": 50,
            }
        )

        self.assertEqual(
            result,
            {
                "batch_status": "saved",
                "attempted_count": 10,
                "saved_count": 10,
                "failed_count": 0,
                "failed_items": [],
                "total_saved_count": 50,
            },
        )
        self.assertNotIn("name", str(result))
        self.assertNotIn("profile_url", str(result))

    def test_validate_professor_candidate_batch_collects_schema_failures(self) -> None:
        payloads, failed_items = _validate_professor_candidate_batch(
            [
                {
                    "name": "张三",
                    "recent_papers": [],
                    "field_confidence": {"name": 0.9},
                    "evidence": {"source": "页面"},
                },
                {
                    "name": "李四",
                    "recent_papers": "Paper A",
                    "field_confidence": 0.8,
                    "evidence": "页面",
                },
            ]
        )

        self.assertEqual([payload.name for payload in payloads], ["张三"])
        self.assertEqual(len(failed_items), 1)
        self.assertEqual(failed_items[0]["index"], 1)
        self.assertEqual(failed_items[0]["name"], "李四")
        self.assertIn("recent_papers", failed_items[0]["reason"])
