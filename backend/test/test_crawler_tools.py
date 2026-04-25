from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services.crawler_tools import (
    CrawlToolContext,
    PageSnapshot,
    ProfessorCandidatePayload,
    crawl_page_with_http,
    is_allowed_crawl_url,
    normalize_candidate_payload,
    record_page_snapshot,
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

    async def test_save_candidates_rolls_back_when_job_is_canceled_before_commit(self) -> None:
        session_factory = _FakeSessionFactory(job_statuses=["running", "canceled"])
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
        self.assertEqual(session_factory.rollback_count, 1)

    async def test_record_page_snapshot_skips_canceled_job(self) -> None:
        session_factory = _FakeSessionFactory(job_status="canceled")
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        row = await record_page_snapshot(
            ctx,
            PageSnapshot(
                url="https://cs.example.edu/faculty",
                title="Faculty",
                text="Faculty page",
                fetch_method="http",
                status="succeeded",
            ),
        )

        self.assertIsNone(row)
        self.assertEqual(session_factory.added, [])

    async def test_record_page_snapshot_rolls_back_when_job_is_canceled_before_commit(self) -> None:
        session_factory = _FakeSessionFactory(job_statuses=["running", "canceled"])
        ctx = CrawlToolContext(
            job_id=1,
            start_url="https://cs.example.edu/faculty",
            university="示例大学",
            school="计算机学院",
            session_factory=session_factory,  # type: ignore[arg-type]
        )

        row = await record_page_snapshot(
            ctx,
            PageSnapshot(
                url="https://cs.example.edu/faculty",
                title="Faculty",
                text="Faculty page",
                fetch_method="http",
                status="succeeded",
            ),
        )

        self.assertIsNone(row)
        self.assertEqual(session_factory.added, [])
        self.assertEqual(session_factory.rollback_count, 1)

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
    def __init__(self, *, job_status: str = "running", job_statuses: list[str] | None = None) -> None:
        self.added: list[object] = []
        self._job_statuses = list(job_statuses or [job_status])
        self.rollback_count = 0

    def __call__(self) -> "_FakeSession":
        return _FakeSession(self)

    def next_job_status(self) -> str:
        if len(self._job_statuses) > 1:
            return self._job_statuses.pop(0)
        return self._job_statuses[0]


class _FakeSession:
    def __init__(self, factory: _FakeSessionFactory) -> None:
        self._factory = factory
        self._staged: list[object] = []

    async def __aenter__(self) -> "_FakeSession":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def add(self, row: object) -> None:
        self._staged.append(row)

    async def get(self, model: object, key: object) -> object:
        _ = model, key
        return _FakeJob(status=self._factory.next_job_status())

    async def scalars(self, statement: object) -> "_FakeScalarResult":
        _ = statement
        return _FakeScalarResult([])

    async def commit(self) -> None:
        self._factory.added.extend(self._staged)
        self._staged.clear()
        return None

    async def rollback(self) -> None:
        self._staged.clear()
        self._factory.rollback_count += 1

    async def refresh(self, row: object) -> None:
        return None


class _FakeScalarResult:
    def __init__(self, items: list[object]) -> None:
        self._items = items

    def __iter__(self):
        return iter(self._items)


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
