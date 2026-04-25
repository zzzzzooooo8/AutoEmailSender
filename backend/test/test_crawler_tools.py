from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services.crawler_tools import (
    CrawlToolContext,
    ProfessorCandidatePayload,
    crawl_page_with_http,
    is_allowed_crawl_url,
    normalize_candidate_payload,
    save_candidates,
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


class CrawlerHttpToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_save_candidates_skips_canceled_job(self) -> None:
        session_factory = _FakeSessionFactory(job_status="canceled")
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        saved = await save_candidates(
            ctx,
            [
                ProfessorCandidatePayload(
                    name="张三",
                    email="zhang@example.edu",
                ),
            ],
        )

        self.assertEqual(saved, [])
        self.assertEqual(session_factory.added, [])

    async def test_crawl_page_with_http_rejects_cross_host_final_url(self) -> None:
        session_factory = _FakeSessionFactory()
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )
        response = _FakeHttpResponse(
            url="https://evil.example.net/people/a",
            text="<html><body>外域正文</body></html>",
        )

        with patch("app.services.crawler_tools.httpx.AsyncClient") as client_class:
            client = client_class.return_value.__aenter__.return_value
            client.get.return_value = response

            snapshot = await crawl_page_with_http(ctx, "https://cs.example.edu/faculty")

        self.assertEqual(snapshot.status, "failed")
        self.assertIn("最终 URL 不在允许范围内", snapshot.error_message or "")
        self.assertNotIn("外域正文", snapshot.text)

        self.assertEqual(len(session_factory.added), 1)
        recorded = session_factory.added[0]
        self.assertEqual(recorded.status, "failed")
        self.assertIsNone(recorded.text_excerpt)


class _FakeSessionFactory:
    def __init__(self, *, job_status: str = "running") -> None:
        self.added: list[object] = []
        self.job_status = job_status

    def __call__(self) -> "_FakeSession":
        return _FakeSession(self.added, self.job_status)


class _FakeSession:
    def __init__(self, added: list[object], job_status: str) -> None:
        self._added = added
        self._job_status = job_status

    async def __aenter__(self) -> "_FakeSession":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def add(self, row: object) -> None:
        self._added.append(row)

    async def get(self, model: object, key: object) -> object:
        _ = model, key
        return _FakeJob(status=self._job_status)

    async def commit(self) -> None:
        return None

    async def refresh(self, row: object) -> None:
        return None


class _FakeJob:
    def __init__(self, *, status: str) -> None:
        self.status = status


class _FakeHttpResponse:
    def __init__(self, *, url: str, text: str) -> None:
        self.url = url
        self.text = text

    def raise_for_status(self) -> None:
        return None


if __name__ == "__main__":
    unittest.main()
