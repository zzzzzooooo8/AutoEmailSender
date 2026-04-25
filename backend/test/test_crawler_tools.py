from __future__ import annotations

import unittest

from app.services.crawler_tools import (
    ProfessorCandidatePayload,
    is_allowed_crawl_url,
    normalize_candidate_payload,
)


class CrawlerToolTests(unittest.TestCase):
    def test_is_allowed_crawl_url_allows_same_host(self) -> None:
        self.assertTrue(
            is_allowed_crawl_url(
                "https://cs.example.edu/faculty",
                "https://cs.example.edu/people/a",
            )
        )

    def test_is_allowed_crawl_url_rejects_other_host(self) -> None:
        self.assertFalse(
            is_allowed_crawl_url(
                "https://cs.example.edu/faculty",
                "https://evil.example.net/people/a",
            )
        )

    def test_normalize_candidate_payload_fills_school_context(self) -> None:
        payload = normalize_candidate_payload(
            ProfessorCandidatePayload(
                name=" 张三 ",
                email=" zhang@example.edu ",
                title="教授",
                university=None,
                school=None,
                department=None,
                research_direction=" 信息检索 ",
                recent_papers=[" Paper A ", ""],
                profile_url="https://cs.example.edu/zhang",
                source_url="https://cs.example.edu/zhang",
                confidence=1.5,
                field_confidence={"email": 1.2},
                evidence={"name": "张三"},
            ),
            university="示例大学",
            school="计算机学院",
        )

        self.assertEqual(payload["name"], "张三")
        self.assertEqual(payload["email"], "zhang@example.edu")
        self.assertEqual(payload["university"], "示例大学")
        self.assertEqual(payload["school"], "计算机学院")
        self.assertEqual(payload["recent_papers"], ["Paper A"])
        self.assertEqual(payload["confidence"], 1.0)
        self.assertEqual(payload["field_confidence"], {"email": 1.0})


if __name__ == "__main__":
    unittest.main()
